import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import { SERVICES_PAGE_SIZE } from '../constants.js';

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
    const allServices: RawBookingService[] = [];
    let offset = 0;
    let hasMorePages = true;

    while (hasMorePages) {
        const result = await wixFetch<QueryServicesResponse>(client, '/bookings/v2/services/query', {
            method: 'POST',
            body: {
                query: {
                    filter: { appId: bookingAppId },
                    paging: { limit: SERVICES_PAGE_SIZE, offset },
                },
                conditionalFields: ['STAFF_MEMBER_DETAILS'],
            },
        });

        const batch = result.services ?? [];
        allServices.push(...batch);

        hasMorePages = batch.length >= SERVICES_PAGE_SIZE;
        if (hasMorePages) {
            offset += SERVICES_PAGE_SIZE;
        }
    }

    return allServices;
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
