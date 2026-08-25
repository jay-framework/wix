import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export async function placeBookingOrder(client: WixClient, cartId: string): Promise<void> {
    await wixFetch(client, `/ecom/v2/carts/${cartId}/place-order`, { method: 'POST', body: {} });
}
