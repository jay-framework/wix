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
import { AggregationDataAggregationResults, AggregationDataAggregationResultsScalarResult, AggregationResultsRangeResults } from '@wix/auto_sdk_stores_products-v-3';

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
 * Price range bucket for aggregation
 */
export interface PriceRangeBucket {
    rangeId: string;
    label: string;
    minValue: number | null;
    maxValue: number | null;
    productCount: number;
    isSelected: boolean;
}

/**
 * Price aggregation data from search
 */
export interface PriceAggregationData {
    /** Minimum price across all products */
    minBound: number;
    /** Maximum price across all products */
    maxBound: number;
    /** Price range buckets with product counts */
    ranges: PriceRangeBucket[];
}

/**
 * Pre-computed wide-range price buckets using logarithmic scale.
 * Each power of 10 is divided into 3 buckets using multipliers 2, 4, 10.
 * 
 * Boundaries: 0, 20, 40, 100, 200, 400, 1000, 2000, 4000, 10000...
 * Buckets: 0-20, 20-40, 40-100, 100-200, 200-400, 400-1000, etc.
 * 
 * We request all buckets and filter out empty ones from the response.
 */
const PRICE_BUCKET_BOUNDARIES = [0, 20, 40, 100, 200, 400, 1000, 2000, 4000, 10000, 20000, 40000, 100000];

const PRICE_BUCKETS = PRICE_BUCKET_BOUNDARIES.slice(0, -1).map((from, i) => ({
    from,
    to: PRICE_BUCKET_BOUNDARIES[i + 1]
}));
// Add open-ended last bucket
PRICE_BUCKETS.push({ from: PRICE_BUCKET_BOUNDARIES[PRICE_BUCKET_BOUNDARIES.length - 1] } as { from: number; to: number });

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
    /** Price aggregation data (bounds and ranges) */
    priceAggregation?: PriceAggregationData;
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

            // Price range filters - use $and when both min and max are present
            const hasMinPrice = filters.minPrice !== undefined && filters.minPrice > 0;
            const hasMaxPrice = filters.maxPrice !== undefined && filters.maxPrice > 0;
            
            if (hasMinPrice && hasMaxPrice) {
                // Both filters: use $and to combine them
                filter["$and"] = [
                    { "actualPriceRange.minValue.amount": { "$gte": String(filters.minPrice) } },
                    { "actualPriceRange.minValue.amount": { "$lte": String(filters.maxPrice) } }
                ];
            } else if (hasMinPrice) {
                filter["actualPriceRange.minValue.amount"] = { "$gte": String(filters.minPrice) };
            } else if (hasMaxPrice) {
                filter["actualPriceRange.minValue.amount"] = { "$lte": String(filters.maxPrice) };
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

            const search = hasSearchQuery ? {
                expression: query.trim(),
                fields: ["name", "description"] as ("name" | "description")[]
            } : undefined


            // Build aggregations for price bounds, buckets, and total count
            const aggregations = [
                // Total count via COUNT_DISTINCT on slug
                {
                    fieldPath: 'slug',
                    name: 'total-count',
                    type: "SCALAR" as const,
                    scalar: { type: "COUNT_DISTINCT" as const }
                },
                // Price buckets with product counts
                {
                    fieldPath: 'actualPriceRange.minValue.amount',
                    name: 'price-buckets',
                    type: "RANGE" as const,
                    range: { buckets: PRICE_BUCKETS }
                },
                // Min price for slider bound
                {
                    fieldPath: 'actualPriceRange.minValue.amount',
                    name: 'min-price',
                    type: "SCALAR" as const,
                    scalar: { type: "MIN" as const }
                },
                // Max price for slider bound
                {
                    fieldPath: 'actualPriceRange.minValue.amount',
                    name: 'max-price',
                    type: "SCALAR" as const,
                    scalar: { type: "MAX" as const }
                }
            ];

            // Call searchProducts (includes aggregations for count, price bounds, and buckets)
            const searchResult = await wixStores.products.searchProducts(
                {
                    filter,
                    // @ts-expect-error - Wix SDK types don't match actual API
                    sort: sort.length > 0 ? sort : undefined,
                    cursorPaging,
                    search,
                    // @ts-expect-error - Wix SDK types don't include aggregations
                    aggregations
                },
                { fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'] }
            );

            const products = searchResult.products || [];
            const nextCursor = searchResult.pagingMetadata?.cursors?.next || null;

            // Extract aggregation results
            const aggResults: AggregationDataAggregationResults[] = searchResult.aggregationData?.results || [];
            const totalCountAgg = aggResults.find((a) => a.name === 'total-count')?.scalar as AggregationDataAggregationResultsScalarResult;
            const minPriceAgg = aggResults.find((a) => a.name === 'min-price')?.scalar as AggregationDataAggregationResultsScalarResult;
            const maxPriceAgg = aggResults.find((a) => a.name === 'max-price')?.scalar as AggregationDataAggregationResultsScalarResult;
            
            const totalCount = totalCountAgg?.value ?? products.length;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bucketsAgg = aggResults.find((a) => a.name === 'price-buckets').ranges as AggregationResultsRangeResults;

            const minBound = minPriceAgg?.value;
            const maxBound = maxPriceAgg?.value;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const buckets = bucketsAgg.results || [];

            // Get currency symbol from first product
            const currencySymbol = products[0]?.currency === 'ILS' ? '₪' : 
                                   products[0]?.currency === 'USD' ? '$' :
                                   products[0]?.currency === 'EUR' ? '€' :
                                   products[0]?.currency === 'GBP' ? '£' : '$';

            // Map price ranges from aggregation
            const priceRanges: PriceRangeBucket[] = [
                { rangeId: 'all', label: 'Show all', minValue: null, maxValue: null, productCount: totalCount, isSelected: true }
            ];
            
            const bucketRanges = buckets
                .filter(bucket => (bucket.count ?? 0) > 0)
                .map(bucket => {
                    const from = bucket.from ?? 0;
                    const to = bucket.to;
                    const label = to 
                        ? `${currencySymbol}${from} - ${currencySymbol}${to}`
                        : `${currencySymbol}${from}+`;
                    return {
                        rangeId: `${from}-${to ?? 'plus'}`,
                        label,
                        minValue: from,
                        maxValue: to ?? null,
                        productCount: bucket.count ?? 0,
                        isSelected: false
                    };
                });
            
            priceRanges.push(...bucketRanges);

            // Map products to card view state
            const mappedProducts = products.map(p => mapProductToCard(p));

            return {
                products: mappedProducts,
                totalCount,
                nextCursor,
                hasMore: nextCursor !== null,
                priceAggregation: {
                    minBound,
                    maxBound,
                    ranges: priceRanges
                }
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

