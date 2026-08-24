import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface AvailabilityTimeSlot {
    scheduleId?: string;
    localStartDate?: string;
    localEndDate?: string;
}

export interface ListAvailabilityTimeSlotsResponse {
    timeSlots?: AvailabilityTimeSlot[];
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
                cursorPaging: { limit: 20 },
            },
        },
    );
    return result.timeSlots ?? [];
}
