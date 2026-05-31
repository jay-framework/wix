import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { GetProductResponse } from './types.js';
import { normalizeProduct } from './normalize-product.js';

export async function getProduct(
    client: WixClient,
    productId: string,
    options?: { includeMerchantSpecificData?: boolean; fields?: string[] },
): Promise<GetProductResponse> {
    const params = new URLSearchParams();
    if (options?.includeMerchantSpecificData) {
        params.set('includeMerchantSpecificData', 'true');
    }
    if (options?.fields) {
        for (const f of options.fields) {
            params.append('fields', f);
        }
    }
    const qs = params.toString();
    const result = await wixFetch<GetProductResponse>(
        client,
        `/stores/v3/products/${productId}${qs ? '?' + qs : ''}`,
        {
            method: 'GET',
        },
    );
    if (result.product) {
        result.product = normalizeProduct(result.product as Record<string, unknown>);
    }
    return result;
}
