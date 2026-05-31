import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { UpdateLineItemQuantityResponse } from './types.js';

export async function updateCurrentCartLineItemQuantity(
    client: WixClient,
    lineItems: Array<{ _id: string; quantity: number }>,
): Promise<UpdateLineItemQuantityResponse> {
    return wixFetch(client, '/ecom/v1/carts/current/updateLineItemsQuantity', {
        method: 'POST',
        body: { lineItems },
    });
}
