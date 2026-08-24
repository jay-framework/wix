import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface RawBookingService {
    _id?: string;
    id?: string;
    name?: string;
    type?: string;
    description?: string;
    hidden?: boolean;
    payment?: {
        fixed?: { price?: { currency?: string; value?: string } };
        options?: { online?: boolean; inPerson?: boolean };
    };
    schedule?: {
        availabilityConstraints?: { sessionDurations?: number[] };
    };
    form?: { _id?: string };
}

export interface QueryServicesResponse {
    services?: RawBookingService[];
}

export async function queryBookingServices(
    client: WixClient,
    bookingAppId: string,
): Promise<RawBookingService[]> {
    const result = await wixFetch<QueryServicesResponse>(client, '/bookings/v2/services/query', {
        method: 'POST',
        body: {
            query: {
                filter: { appId: bookingAppId },
                paging: { limit: 100 },
            },
            conditionalFields: ['STAFF_MEMBER_DETAILS'],
        },
    });
    return result.services ?? [];
}

export async function getBookingServiceById(
    client: WixClient,
    serviceId: string,
): Promise<RawBookingService | undefined> {
    const result = await wixFetch<QueryServicesResponse>(client, '/bookings/v2/services/query', {
        method: 'POST',
        body: {
            query: {
                filter: { _id: serviceId },
                paging: { limit: 1 },
            },
        },
    });
    return result.services?.[0];
}
