import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { GetProductResponse } from './types.js';

export async function getProduct(
    client: WixClient,
    productId: string,
    options?: { includeMerchantSpecificData?: boolean },
): Promise<GetProductResponse> {
    const params = new URLSearchParams();
    if (options?.includeMerchantSpecificData) {
        params.set('includeMerchantSpecificData', 'true');
    }
    const qs = params.toString();
    return wixFetch(client, `/stores/v3/products/${productId}${qs ? '?' + qs : ''}`, {
        method: 'GET',
    });
}
