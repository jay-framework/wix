import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface CreateBookingResponse {
    booking: { id: string };
}

export async function createBookingRecord(
    client: WixClient,
    body: {
        booking: Record<string, unknown>;
        formSubmission: Record<string, string>;
    },
): Promise<CreateBookingResponse> {
    return wixFetch(client, '/bookings/v2/bookings', { method: 'POST', body });
}
