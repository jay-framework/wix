import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { AddToCurrentCartResponse, CatalogReference } from './types.js';

export interface AddToCartLineItem {
    catalogReference: CatalogReference;
    quantity: number;
}

export async function addToCurrentCart(
    client: WixClient,
    lineItems: AddToCartLineItem[],
): Promise<AddToCurrentCartResponse> {
    return wixFetch(client, '/ecom/v1/carts/current/add-to-cart', {
        method: 'POST',
        body: { lineItems },
    });
}
