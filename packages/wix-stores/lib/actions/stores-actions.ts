/**
 * Server Actions for Wix Stores
 *
 * Provides RPC-style actions for client-side code to interact with the
 * Wix Stores Catalog V3 API.
 */

import { makeJayQuery, ActionError } from '@jay-framework/fullstack-component';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import { AvailabilityStatus, ProductCardViewState } from '../contracts/product-card.jay-contract';
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
 * Search products using the Wix Stores Catalog V3 API.
 *
 * Queries products and applies client-side filtering for search terms,
 * stock status, price range, and sorting.
 *
 * @example
 * ```typescript
 * const results = await searchProducts({
 *     query: 'shoes',
 *     filters: { inStockOnly: true, categoryIds: ['cat-123'] },
 *     sortBy: 'price_asc',
 *     page: 1,
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
            // Use queryProducts for all queries
            // Include VARIANT_OPTION_CHOICE_NAMES for quick-add option display
            let queryBuilder = wixStores.products.queryProducts({
                fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES']
            });

            // Apply sorting (using supported fields)
            switch (sortBy) {
                case 'newest':
                    queryBuilder = queryBuilder.descending('_createdDate');
                    break;
                case 'name_asc':
                    queryBuilder = queryBuilder.ascending('slug');
                    break;
                case 'name_desc':
                    queryBuilder = queryBuilder.descending('slug');
                    break;
                // 'relevance', 'price_asc', 'price_desc' - will sort client-side
            }

            // Apply cursor-based pagination
            queryBuilder = queryBuilder.limit(pageSize);
            if (cursor) {
                queryBuilder = queryBuilder.skipTo(cursor);
            }

            const queryResult = await queryBuilder.find();
            let products = queryResult.items || [];

            // Get cursor for next page
            const nextCursor = queryResult.cursors?.next || null;
            const totalCount = 0;

            // Map products to card view state
            let mappedProducts = products.map(p => mapProductToCard(p));

            // Apply client-side search filtering if query provided
            if (query && query.trim().length > 0) {
                const searchLower = query.toLowerCase();
                mappedProducts = mappedProducts.filter(p =>
                    p.name.toLowerCase().includes(searchLower) ||
                    p.slug.toLowerCase().includes(searchLower)
                );
            }

            // Apply client-side stock filtering
            if (filters.inStockOnly) {
                mappedProducts = mappedProducts.filter(p =>
                    p.inventory.availabilityStatus !== AvailabilityStatus.OUT_OF_STOCK
                );
            }

            // Apply client-side price filtering
            if (filters.minPrice !== undefined && filters.minPrice > 0) {
                mappedProducts = mappedProducts.filter(p =>
                    parseFloat(p.actualPriceRange.minValue.amount) >= filters.minPrice!
                );
            }
            if (filters.maxPrice !== undefined && filters.maxPrice > 0) {
                mappedProducts = mappedProducts.filter(p =>
                    parseFloat(p.actualPriceRange.minValue.amount) <= filters.maxPrice!
                );
            }

            // Client-side price sorting if needed
            if (sortBy === 'price_asc') {
                mappedProducts.sort((a, b) =>
                    parseFloat(a.actualPriceRange.minValue.amount) - parseFloat(b.actualPriceRange.minValue.amount)
                );
            } else if (sortBy === 'price_desc') {
                mappedProducts.sort((a, b) =>
                    parseFloat(b.actualPriceRange.minValue.amount) - parseFloat(a.actualPriceRange.minValue.amount)
                );
            }

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

