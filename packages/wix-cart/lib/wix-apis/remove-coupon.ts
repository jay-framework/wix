import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { RemoveCouponResponse } from './types.js';

export async function removeCouponFromCurrentCart(
    client: WixClient,
): Promise<RemoveCouponResponse> {
    return wixFetch(client, '/ecom/v1/carts/current/remove-coupon', {
        method: 'POST',
        body: {},
    });
}
