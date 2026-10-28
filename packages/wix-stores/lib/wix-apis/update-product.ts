import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import type { ProductUpdate, UpdateProductResponse } from './types.js';
import { normalizeProduct } from './normalize-product.js';

/**
 * Partially update a Catalog V3 product (PATCH /stores/v3/products/{id}).
 *
 * Only `id` and `revision` are required; omitted top-level fields are left unchanged,
 * but repeated fields (e.g. `media.itemsInfo.items`) are overwritten as a whole array.
 * Throws `WixApiError` (409 on a stale revision, 401/403 without write permission).
 */
export async function updateProduct(
    client: WixClient,
    product: ProductUpdate,
    options?: { fields?: string[] },
): Promise<UpdateProductResponse> {
    const result = await wixFetch<UpdateProductResponse>(
        client,
        `/stores/v3/products/${product.id}`,
        {
            method: 'PATCH',
            body: { product, ...(options?.fields ? { fields: options.fields } : {}) },
        },
    );
    if (result.product) {
        result.product = normalizeProduct(result.product as Record<string, unknown>);
    }
    return result;
}
