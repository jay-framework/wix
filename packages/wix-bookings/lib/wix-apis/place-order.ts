import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client/client';

/** Place the cart's order; returns the order's ID (the eCommerce thank-you page shows that order). */
export async function placeBookingOrder(
    client: WixClient,
    cartId: string,
): Promise<{ orderId?: string }> {
    const res = await wixFetch<{ orderId?: string }>(
        client,
        `/ecom/v2/carts/${cartId}/place-order`,
        { method: 'POST', body: {} },
    );
    return { orderId: res?.orderId };
}
