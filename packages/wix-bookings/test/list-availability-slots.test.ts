// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/wix-server-client', () => ({
    wixFetch: vi.fn(),
}));

import { wixFetch } from '@jay-framework/wix-server-client';
import { listAvailabilityTimeSlots } from '../lib/wix-apis/list-availability-slots.js';

const mockWixFetch = vi.mocked(wixFetch);
const mockClient = {} as Parameters<typeof listAvailabilityTimeSlots>[0];

const baseInput = {
    serviceId: 'svc-1',
    fromLocalDate: '2026-08-20T09:00:00',
    toLocalDate: '2026-09-03T09:00:00',
    timeZone: 'UTC',
};

describe('listAvailabilityTimeSlots', () => {
    beforeEach(() => {
        mockWixFetch.mockReset();
    });

    it('should fetch all pages when Wix returns a next cursor', async () => {
        mockWixFetch
            .mockResolvedValueOnce({
                timeSlots: [
                    {
                        scheduleId: 'sched-1',
                        localStartDate: '2026-08-20T10:00:00',
                        localEndDate: '2026-08-20T10:30:00',
                    },
                ],
                pagingMetadata: { cursors: { next: 'page-2' }, hasNext: true },
            })
            .mockResolvedValueOnce({
                timeSlots: [
                    {
                        scheduleId: 'sched-1',
                        localStartDate: '2026-08-20T14:00:00',
                        localEndDate: '2026-08-20T14:30:00',
                    },
                ],
                pagingMetadata: { cursors: {}, hasNext: false },
            });

        const slots = await listAvailabilityTimeSlots(mockClient, baseInput);

        expect(mockWixFetch).toHaveBeenCalledTimes(2);
        expect(slots).toHaveLength(2);
        expect(slots[0]?.localStartDate).toBe('2026-08-20T10:00:00');
        expect(slots[1]?.localStartDate).toBe('2026-08-20T14:00:00');
    });

    it('should stop after the first page when no next cursor is returned', async () => {
        mockWixFetch.mockResolvedValueOnce({
            timeSlots: [
                {
                    scheduleId: 'sched-1',
                    localStartDate: '2026-08-20T10:00:00',
                    localEndDate: '2026-08-20T10:30:00',
                },
            ],
            pagingMetadata: { cursors: {}, hasNext: false },
        });

        const slots = await listAvailabilityTimeSlots(mockClient, baseInput);

        expect(mockWixFetch).toHaveBeenCalledTimes(1);
        expect(slots).toHaveLength(1);
    });

    it('should stop fetching once maxSlots is reached', async () => {
        mockWixFetch
            .mockResolvedValueOnce({
                timeSlots: Array.from({ length: 100 }, (_, index) => ({
                    scheduleId: 'sched-1',
                    localStartDate: `2026-08-20T${String(10 + index).padStart(2, '0')}:00:00`,
                    localEndDate: `2026-08-20T${String(10 + index).padStart(2, '0')}:30:00`,
                })),
                pagingMetadata: { cursors: { next: 'page-2' }, hasNext: true },
            })
            .mockResolvedValueOnce({
                timeSlots: [
                    {
                        scheduleId: 'sched-1',
                        localStartDate: '2026-08-21T10:00:00',
                        localEndDate: '2026-08-21T10:30:00',
                    },
                ],
                pagingMetadata: { cursors: {}, hasNext: false },
            });

        const slots = await listAvailabilityTimeSlots(mockClient, baseInput, { maxSlots: 100 });

        expect(mockWixFetch).toHaveBeenCalledTimes(1);
        expect(slots).toHaveLength(100);
    });
});
