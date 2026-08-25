// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/wix-server-client', () => ({
    wixFetch: vi.fn(),
}));

import { wixFetch } from '@jay-framework/wix-server-client';
import { listEventTimeSlots } from '../lib/wix-apis/list-event-time-slots.js';

const mockWixFetch = vi.mocked(wixFetch);
const mockClient = {} as Parameters<typeof listEventTimeSlots>[0];

const baseInput = {
    serviceIds: ['svc-class-1'],
    fromLocalDate: '2026-08-20T09:00:00',
    toLocalDate: '2026-09-03T09:00:00',
    timeZone: 'UTC',
};

describe('listEventTimeSlots', () => {
    beforeEach(() => {
        mockWixFetch.mockReset();
    });

    it('should fetch all pages when Wix returns a next cursor', async () => {
        mockWixFetch
            .mockResolvedValueOnce({
                timeSlots: [
                    {
                        eventInfo: { eventId: 'event-1' },
                        localStartDate: '2026-08-20T14:00:00',
                        localEndDate: '2026-08-20T15:00:00',
                    },
                ],
                pagingMetadata: { cursors: { next: 'page-2' }, hasNext: true },
            })
            .mockResolvedValueOnce({
                timeSlots: [
                    {
                        eventInfo: { eventId: 'event-1' },
                        localStartDate: '2026-08-27T14:00:00',
                        localEndDate: '2026-08-27T15:00:00',
                    },
                ],
                pagingMetadata: { cursors: {}, hasNext: false },
            });

        const slots = await listEventTimeSlots(mockClient, baseInput);

        expect(mockWixFetch).toHaveBeenCalledTimes(2);
        expect(slots).toHaveLength(2);
        expect(slots[0]?.localStartDate).toBe('2026-08-20T14:00:00');
        expect(slots[1]?.localStartDate).toBe('2026-08-27T14:00:00');
    });

    it('should stop after the first page when no next cursor is returned', async () => {
        mockWixFetch.mockResolvedValueOnce({
            timeSlots: [
                {
                    eventInfo: { eventId: 'event-1' },
                    localStartDate: '2026-08-20T14:00:00',
                    localEndDate: '2026-08-20T15:00:00',
                },
            ],
            pagingMetadata: { cursors: {}, hasNext: false },
        });

        const slots = await listEventTimeSlots(mockClient, baseInput);

        expect(mockWixFetch).toHaveBeenCalledTimes(1);
        expect(slots).toHaveLength(1);
    });
});
