import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface CreateCheckoutFromCurrentCartResponse {
    checkoutId?: string;
}

export async function createCheckoutFromCurrentCart(
    client: WixClient,
): Promise<CreateCheckoutFromCurrentCartResponse> {
    return wixFetch(client, '/ecom/v1/carts/current/create-checkout', {
        method: 'POST',
        body: {},
    });
}
