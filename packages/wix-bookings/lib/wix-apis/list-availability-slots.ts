import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

const AVAILABILITY_PAGE_SIZE = 100;

export interface AvailabilityTimeSlot {
    scheduleId?: string;
    localStartDate?: string;
    localEndDate?: string;
}

interface CursorPagingMetadata {
    cursors?: { next?: string };
    hasNext?: boolean;
}

export interface ListAvailabilityTimeSlotsResponse {
    timeSlots?: AvailabilityTimeSlot[];
    pagingMetadata?: CursorPagingMetadata;
}

export async function listAvailabilityTimeSlots(
    client: WixClient,
    input: {
        serviceId: string;
        fromLocalDate: string;
        toLocalDate: string;
        timeZone: string;
    },
): Promise<AvailabilityTimeSlot[]> {
    const allSlots: AvailabilityTimeSlot[] = [];
    let cursor: string | undefined;

    while (true) {
        const result = await wixFetch<ListAvailabilityTimeSlotsResponse>(
            client,
            '/_api/service-availability/v2/time-slots',
            {
                method: 'POST',
                body: {
                    serviceId: input.serviceId,
                    fromLocalDate: input.fromLocalDate,
                    toLocalDate: input.toLocalDate,
                    timeZone: input.timeZone,
                    bookable: true,
                    cursorPaging: cursor
                        ? { cursor, limit: AVAILABILITY_PAGE_SIZE }
                        : { limit: AVAILABILITY_PAGE_SIZE },
                },
            },
        );
        allSlots.push(...(result.timeSlots ?? []));

        cursor = result.pagingMetadata?.cursors?.next;
        if (!cursor || result.pagingMetadata?.hasNext === false) {
            break;
        }
    }

    return allSlots;
}
