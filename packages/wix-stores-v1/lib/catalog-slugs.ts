/**
 * Paginate the V1 products API to collect slugs for setup / config validation.
 */

import type { WixClient } from '@wix/sdk';
import { queryProducts } from './wix-apis/index.js';

export async function fetchCatalogProductSlugs(
    wixClient: WixClient,
): Promise<{ slugs: Set<string>; totalCount: number }> {
    const slugs = new Set<string>();
    let offset = 0;
    const limit = 100;
    let totalCount = 0;

    while (true) {
        const response = await queryProducts(wixClient, { paging: { limit, offset } });
        const products = response.products ?? [];
        for (const product of products) {
            if (product.slug) {
                slugs.add(product.slug);
            }
        }
        totalCount = response.metadata?.items ?? Math.max(totalCount, offset + products.length);
        if (products.length < limit) {
            break;
        }
        offset += limit;
    }

    return { slugs, totalCount };
}
