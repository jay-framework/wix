import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client/client';
import type { ParticipantFormValue } from '../types.js';

export interface CreateBookingResponse {
    booking: { id: string };
}

export async function createBookingRecord(
    client: WixClient,
    body: {
        booking: Record<string, unknown>;
        formSubmission: Record<string, ParticipantFormValue>;
    },
): Promise<CreateBookingResponse> {
    return wixFetch(client, '/bookings/v2/bookings', { method: 'POST', body });
}
