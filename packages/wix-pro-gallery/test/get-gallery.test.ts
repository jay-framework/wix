// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/wix-server-client', () => ({ wixFetch: vi.fn() }));

import { wixFetch } from '@jay-framework/wix-server-client';
import { getGalleryItems } from '../lib/wix-apis/get-gallery.js';

const mockFetch = vi.mocked(wixFetch);
const client = {} as Parameters<typeof getGalleryItems>[0];
const items = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `i${from + i}` }));

describe('getGalleryItems', () => {
    it('follows offset paging until all items are read', async () => {
        mockFetch
            .mockResolvedValueOnce({ gallery: { totalItems: 130, items: items(0, 100) } })
            .mockResolvedValueOnce({ gallery: { totalItems: 130, items: items(100, 30) } });
        const result = await getGalleryItems(client, 'g/1');
        expect(result).toHaveLength(130);
        expect(mockFetch.mock.calls.map((c) => c[1])).toEqual([
            '/progallery/v2/galleries/g%2F1?offset=0&limit=100',
            '/progallery/v2/galleries/g%2F1?offset=100&limit=100',
        ]);
    });
});
