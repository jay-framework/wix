import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { GetProductBySlugResponse } from './types.js';

export async function getProductBySlug(
    client: WixClient,
    slug: string,
    options?: { includeMerchantSpecificData?: boolean },
): Promise<GetProductBySlugResponse> {
    const params = new URLSearchParams();
    if (options?.includeMerchantSpecificData) {
        params.set('includeMerchantSpecificData', 'true');
    }
    const qs = params.toString();
    return wixFetch(client, `/stores/v3/products/bySlug/${slug}${qs ? '?' + qs : ''}`, {
        method: 'GET',
    });
}
