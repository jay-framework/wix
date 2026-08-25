import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

const EVENT_SLOTS_PAGE_SIZE = 100;

export interface EventTimeSlot {
    localStartDate?: string;
    localEndDate?: string;
    eventInfo?: { eventId?: string };
}

interface CursorPagingMetadata {
    cursors?: { next?: string };
    hasNext?: boolean;
}

export interface ListEventTimeSlotsResponse {
    timeSlots?: EventTimeSlot[];
    pagingMetadata?: CursorPagingMetadata;
}

export async function listEventTimeSlots(
    client: WixClient,
    input: {
        serviceIds: string[];
        fromLocalDate: string;
        toLocalDate: string;
        timeZone: string;
    },
    options?: { maxSlots?: number },
): Promise<EventTimeSlot[]> {
    const allSlots: EventTimeSlot[] = [];
    const maxSlots = options?.maxSlots;
    let cursor: string | undefined;
    let hasMorePages = true;

    while (hasMorePages) {
        const result = await wixFetch<ListEventTimeSlotsResponse>(
            client,
            '/_api/service-availability/v2/time-slots/event',
            {
                method: 'POST',
                body: {
                    serviceIds: input.serviceIds,
                    fromLocalDate: input.fromLocalDate,
                    toLocalDate: input.toLocalDate,
                    timeZone: input.timeZone,
                    includeNonBookable: false,
                    cursorPaging: cursor
                        ? { cursor, limit: EVENT_SLOTS_PAGE_SIZE }
                        : { limit: EVENT_SLOTS_PAGE_SIZE },
                },
            },
        );
        allSlots.push(...(result.timeSlots ?? []));

        if (maxSlots !== undefined && allSlots.length >= maxSlots) {
            return allSlots.slice(0, maxSlots);
        }

        cursor = result.pagingMetadata?.cursors?.next;
        hasMorePages = !!cursor && result.pagingMetadata?.hasNext !== false;
    }

    return allSlots;
}
