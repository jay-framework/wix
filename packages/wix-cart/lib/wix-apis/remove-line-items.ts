import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { RemoveLineItemsResponse } from './types.js';

export async function removeLineItemsFromCurrentCart(
    client: WixClient,
    lineItemIds: string[],
): Promise<RemoveLineItemsResponse> {
    return wixFetch(client, '/ecom/v1/carts/current/removeLineItems', {
        method: 'POST',
        body: { lineItemIds },
    });
}
