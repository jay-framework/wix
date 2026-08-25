import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface CreateBookingCartResponse {
    cart: { id: string };
}

export async function createBookingCart(
    client: WixClient,
    bookingId: string,
    bookingAppId: string,
): Promise<CreateBookingCartResponse> {
    return wixFetch(client, '/ecom/v2/carts', {
        method: 'POST',
        body: {
            catalogItems: [
                {
                    quantity: 1,
                    catalogReference: { catalogItemId: bookingId, appId: bookingAppId },
                },
            ],
            cart: { source: { channelType: 'WEB' } },
        },
    });
}
