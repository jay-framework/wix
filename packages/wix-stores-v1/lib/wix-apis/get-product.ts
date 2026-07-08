import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { GetProductV1Response, V1Product } from './types.js';

export async function getProduct(
    client: WixClient,
    productId: string,
    options?: { includeMerchantSpecificData?: boolean },
): Promise<GetProductV1Response> {
    const params = new URLSearchParams();
    if (options?.includeMerchantSpecificData) {
        params.set('includeMerchantSpecificData', 'true');
    }
    const qs = params.toString();
    const result = await wixFetch<GetProductV1Response>(
        client,
        `/stores/v1/products/${productId}${qs ? '?' + qs : ''}`,
        { method: 'GET' },
    );
    if (result.product) {
        const raw = result.product as Record<string, unknown>;
        if (raw.id && !result.product._id) {
            result.product._id = raw.id as string;
        }
    }
    return result;
}
