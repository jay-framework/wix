import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface GetCheckoutUrlResponse {
    checkoutUrl?: string;
}

export async function getBookingCheckoutUrl(
    client: WixClient,
    cartId: string,
): Promise<GetCheckoutUrlResponse> {
    return wixFetch(client, `/ecom/v2/carts/${cartId}/get-checkout-url`, {
        method: 'POST',
        body: {},
    });
}
