// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/wix-server-client/client', () => ({ wixFetch: vi.fn() }));

import { wixFetch } from '@jay-framework/wix-server-client/client';
import { queryAllPages } from '../lib/wix-apis/query-all-pages.js';

const mockWixFetch = vi.mocked(wixFetch);

describe('queryAllPages', () => {
    beforeEach(() => mockWixFetch.mockReset());

    it('should follow the next cursor until the last page', async () => {
        mockWixFetch
            .mockResolvedValueOnce({
                staffMembers: [{ id: 'a' }],
                pagingMetadata: { cursors: { next: 'cursor-2' } },
            })
            .mockResolvedValueOnce({
                staffMembers: [{ id: 'b' }],
                pagingMetadata: { cursors: {} },
            });

        const items = await queryAllPages(
            {} as any,
            '/bookings/v1/staff-members/query',
            'staffMembers',
        );

        expect(items).toEqual([{ id: 'a' }, { id: 'b' }]);
        expect(mockWixFetch).toHaveBeenCalledTimes(2);
        expect(mockWixFetch.mock.calls[0][2]).toEqual({
            method: 'POST',
            body: { query: { cursorPaging: { limit: 100 } } },
        });
        expect(mockWixFetch.mock.calls[1][2]).toEqual({
            method: 'POST',
            body: { query: { cursorPaging: { limit: 100, cursor: 'cursor-2' } } },
        });
    });

    it('should stop after one page when there is no next cursor', async () => {
        mockWixFetch.mockResolvedValueOnce({ resources: [{ id: 'r' }] });

        const items = await queryAllPages({} as any, '/bookings/v2/resources/query', 'resources');

        expect(items).toEqual([{ id: 'r' }]);
        expect(mockWixFetch).toHaveBeenCalledTimes(1);
    });
});
