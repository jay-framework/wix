import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { ListCustomizationsResponse } from './types.js';

export async function listCustomizations(
    client: WixClient,
    productId: string,
): Promise<ListCustomizationsResponse> {
    return wixFetch(client, `/stores/v3/products/${productId}/customizations`, {
        method: 'GET',
    });
}
