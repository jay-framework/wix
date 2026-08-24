import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface EventTimeSlot {
    localStartDate?: string;
    localEndDate?: string;
    eventInfo?: { eventId?: string };
}

export interface ListEventTimeSlotsResponse {
    timeSlots?: EventTimeSlot[];
}

export async function listEventTimeSlots(
    client: WixClient,
    input: {
        serviceIds: string[];
        fromLocalDate: string;
        toLocalDate: string;
        timeZone: string;
    },
): Promise<EventTimeSlot[]> {
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
            },
        },
    );
    return result.timeSlots ?? [];
}
