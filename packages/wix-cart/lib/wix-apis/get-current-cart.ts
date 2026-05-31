import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { GetCurrentCartResponse } from './types.js';

export async function getCurrentCart(
    client: WixClient,
): Promise<GetCurrentCartResponse> {
    return wixFetch(client, '/ecom/v1/carts/current', { method: 'GET' });
}
