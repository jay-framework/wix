import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { Cart } from './types.js';

export async function updateCurrentCart(
    client: WixClient,
    cartInfo: { couponCode?: string },
): Promise<Cart> {
    return wixFetch(client, '/ecom/v1/carts/current', {
        method: 'PATCH',
        body: { cartInfo },
    });
}
