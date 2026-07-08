import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { GetProductBySlugResponse } from './types.js';
import { normalizeProduct } from './normalize-product.js';

export async function getProductBySlug(
    client: WixClient,
    slug: string,
    options?: { includeMerchantSpecificData?: boolean; fields?: string[] },
): Promise<GetProductBySlugResponse> {
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
    const result = await wixFetch<GetProductBySlugResponse>(
        client,
        `/stores/v3/products/slug/${slug}${qs ? '?' + qs : ''}`,
        {
            method: 'GET',
        },
    );
    if (result.product) {
        result.product = normalizeProduct(result.product as Record<string, unknown>);
    }
    return result;
}
