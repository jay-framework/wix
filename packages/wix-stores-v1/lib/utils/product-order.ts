/**
 * The configured product order (see WixStoresV1Config.productOrder) of the default product listing.
 */

import type { WixFilter } from '@jay-framework/wix-server-client';

/**
 * Whether a search is the default listing that follows the configured product order: a product order is
 * configured, the sort is relevance, and there is no query or filter.
 */
export function usesProductOrder(
    productOrder: string[],
    sortBy: string,
    filter: WixFilter,
): boolean {
    return productOrder.length > 0 && sortBy === 'relevance' && Object.keys(filter).length === 0;
}

/**
 * One page of `products` (every product, by numericId) with the `productOrder` slugs moved first, in that
 * order; the rest keep their order. `totalResults` counts every product.
 */
export function pageInProductOrder<T extends { slug?: string }>(
    products: T[],
    productOrder: string[],
    page: number,
    pageSize: number,
): { products: T[]; totalResults: number } {
    const rank = new Map(productOrder.map((slug, i) => [slug, i]));
    const at = (product: T) => rank.get(product.slug || '') ?? rank.size;
    const ordered = [...products].sort((a, b) => at(a) - at(b));
    return {
        products: ordered.slice((page - 1) * pageSize, page * pageSize),
        totalResults: ordered.length,
    };
}
