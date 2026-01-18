/**
 * Server Actions for Wix Stores
 *
 * Provides RPC-style actions for client-side code to interact with the
 * Wix Stores Catalog V3 API.
 */

import { makeJayQuery, ActionError } from '@jay-framework/fullstack-component';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';
import { mapProductToCard } from '../utils/product-mapper.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Sort options for product search
 */
export type ProductSortField = 'relevance' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'newest';

/**
 * Product search filters
 */
export interface ProductSearchFilters {
    /** Only show products in stock */
    inStockOnly?: boolean;
    /** Minimum price filter */
    minPrice?: number;
    /** Maximum price filter */
    maxPrice?: number;
    /** Filter by category IDs */
    categoryIds?: string[];
}

/**
 * Input for searchProducts action
 */
export interface SearchProductsInput {
    /** Search query text */
    query: string;
    /** Filters to apply */
    filters?: ProductSearchFilters;
    /** Sort order */
    sortBy?: ProductSortField;
    /** Cursor for pagination (from previous response's nextCursor) */
    cursor?: string;
    /** Items per page (default: 12) */
    pageSize?: number;
}

/**
 * Output for searchProducts action
 */
export interface SearchProductsOutput {
    /** List of matching products */
    products: ProductCardViewState[];
    /** Total number of matching products */
    totalCount: number;
    /** Cursor for next page (null if no more results) */
    nextCursor: string | null;
    /** Whether there are more results */
    hasMore: boolean;
}

/**
 * Input for getProductBySlug action
 */
export interface GetProductBySlugInput {
    /** Product URL slug */
    slug: string;
}


// ============================================================================
// Actions
// ============================================================================

/**
 * Search products using the Wix Stores Catalog V3 searchProducts API.
 *
 * Uses server-side filtering and sorting for optimal performance:
 * - Text search on name and description
 * - Price range filtering
 * - Stock status filtering
 * - Category filtering
 * - Price/name/date sorting
 *
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/catalog-v3/products-v3/search-products
 *
 * @example
 * ```typescript
 * const results = await searchProducts({
 *     query: 'shoes',
 *     filters: { inStockOnly: true, categoryIds: ['cat-123'] },
 *     sortBy: 'price_asc',
 *     pageSize: 12
 * });
 * ```
 */
export const searchProducts = makeJayQuery('wixStores.searchProducts')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(async (
        input: SearchProductsInput,
        wixStores: WixStoresService
    ): Promise<SearchProductsOutput> => {
        const {
            query,
            filters = {},
            sortBy = 'relevance',
            cursor,
            pageSize = 12
        } = input;

        try {
            // Build server-side filter object
            // See: https://dev.wix.com/docs/sdk/backend-modules/stores/catalog-v3/products-v3/search-products
            const filter: Record<string, unknown> = {
                // Only visible products
                "visible": { "$eq": true }
            };

            // Price range filters (both min and max can apply to same field)
            const priceFilter: Record<string, string> = {};
            if (filters.minPrice !== undefined && filters.minPrice > 0) {
                priceFilter["$gte"] = String(filters.minPrice);
            }
            if (filters.maxPrice !== undefined && filters.maxPrice > 0) {
                priceFilter["$lte"] = String(filters.maxPrice);
            }
            if (Object.keys(priceFilter).length > 0) {
                filter["actualPriceRange.minValue.amount"] = priceFilter;
            }

            // Stock status filter
            if (filters.inStockOnly) {
                filter["inventory.availabilityStatus"] = { "$eq": "IN_STOCK" };
            }

            // Category filter
            if (filters.categoryIds && filters.categoryIds.length > 0) {
                filter["allCategoriesInfo.categories"] = {
                    "$matchItems": filters.categoryIds.map(id => ({ id: { "$eq": id } }))
                };
            }

            // Build sort array
            const sort: Array<{ fieldName: string; order: "ASC" | "DESC" }> = [];
            switch (sortBy) {
                case 'price_asc':
                    sort.push({ fieldName: "actualPriceRange.minValue.amount", order: "ASC" });
                    break;
                case 'price_desc':
                    sort.push({ fieldName: "actualPriceRange.minValue.amount", order: "DESC" });
                    break;
                case 'name_asc':
                    sort.push({ fieldName: "name", order: "ASC" });
                    break;
                case 'name_desc':
                    sort.push({ fieldName: "name", order: "DESC" });
                    break;
                case 'newest':
                    sort.push({ fieldName: "_createdDate", order: "DESC" });
                    break;
                // 'relevance' - no sort, use search relevance
            }

            // Build cursor paging
            const cursorPaging = cursor
                ? { cursor, limit: pageSize }
                : { limit: pageSize };

            // Build search expression (for text search)
            const hasSearchQuery = query && query.trim().length > 0;

            // Build count filter (countProducts uses different syntax than searchProducts)
            // Note: countProducts doesn't support text search, so count may differ when searching
            const countFilter: Record<string, unknown> = {
                visible: true
            };
            if (filters.categoryIds && filters.categoryIds.length > 0) {
                countFilter['collections.id'] = { $hasSome: filters.categoryIds };
            }

            const search = hasSearchQuery ? {
                expression: query.trim(),
                fields: ["name", "description"] as ("name" | "description")[]
            } : undefined


            // Call searchProducts and countProducts in parallel
            const [searchResult, countResult] = await Promise.all([
                wixStores.products.searchProducts(
                    {
                        filter,
                        // @ts-expect-error - Wix SDK types don't match actual API
                        sort: sort.length > 0 ? sort : undefined,
                        cursorPaging,
                        search                    },
                    { fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'] }
                ),
                wixStores.products.countProducts({ filter, search })
            ]);

            const products = searchResult.products || [];
            const nextCursor = searchResult.pagingMetadata?.cursors?.next || null;
            const totalCount = countResult.count || 0;

            // Map products to card view state
            const mappedProducts = products.map(p => mapProductToCard(p));

            return {
                products: mappedProducts,
                totalCount,
                nextCursor,
                hasMore: nextCursor !== null
            };
        } catch (error) {
            console.error('[wixStores.searchProducts] Search failed:', error);
            throw new ActionError('SEARCH_FAILED', 'Failed to search products');
        }
    });


/**
 * Get a single product by its URL slug.
 *
 * @example
 * ```typescript
 * const product = await getProductBySlug({ slug: 'blue-sneakers' });
 * ```
 */
export const getProductBySlug = makeJayQuery('wixStores.getProductBySlug')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withCaching({ maxAge: 300, staleWhileRevalidate: 600 }) // Cache for 5 min, stale for 10 min
    .withHandler(async (
        input: GetProductBySlugInput,
        wixStores: WixStoresService
    ): Promise<ProductCardViewState | null> => {
        const { slug } = input;

        if (!slug) {
            throw new ActionError('INVALID_INPUT', 'Product slug is required');
        }

        try {
            // Include VARIANT_OPTION_CHOICE_NAMES for quick-add option display
            const result = await wixStores.products.getProductBySlug(slug, {
                fields: ['MEDIA_ITEMS_INFO', 'VARIANT_OPTION_CHOICE_NAMES']
            });

            if (!result.product) {
                return null;
            }

            return mapProductToCard(result.product);
        } catch (error) {
            console.error('[wixStores.getProductBySlug] Failed to get product:', error);
            // Return null for not found instead of throwing
            return null;
        }
    });

/**
 * Get available categories for filtering.
 *
 * @example
 * ```typescript
 * const categories = await getCategories();
 * ```
 */
export const getCategories = makeJayQuery('wixStores.getCategories')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withCaching({ maxAge: 3600 }) // Cache categories for 1 hour
    .withHandler(async (
        _input: Record<string, never>,
        wixStores: WixStoresService
    ): Promise<Array<{ categoryId: string; categoryName: string }>> => {
        try {
            const result = await wixStores.categories.queryCategories({
                treeReference: {
                    appNamespace: '@wix/stores'
                }
            })
                .eq('visible', true)
                .find();

            return (result.items || []).map(cat => ({
                categoryId: cat._id || '',
                categoryName: cat.name || ''
            }));
        } catch (error) {
            console.error('[wixStores.getCategories] Failed to load categories:', error);
            throw new ActionError('LOAD_FAILED', 'Failed to load categories');
        }
    });

