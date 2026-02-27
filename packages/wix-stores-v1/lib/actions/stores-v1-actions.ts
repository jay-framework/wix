/**
 * Server Actions for Wix Stores (Catalog V1)
 *
 * Provides RPC-style actions for client-side code to interact with the
 * Wix Stores Catalog V1 API.
 * 
 * Key differences from V3:
 * - Uses queryProducts() with skip-based pagination instead of searchProducts() with cursors
 * - Uses collections instead of categories
 * - Different filter/sort syntax
 */

import { makeJayQuery, ActionError } from '@jay-framework/fullstack-component';
import { WIX_STORES_V1_SERVICE_MARKER, WixStoresV1Service } from '../services/wix-stores-v1-service.js';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';
import { mapProductToCard, mapCollectionToViewState, CollectionViewState } from '../utils/product-mapper-v1.js';
import {Product} from "@wix/auto_sdk_stores_products";

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
    /** Minimum price filter */
    minPrice?: number;
    /** Maximum price filter */
    maxPrice?: number;
    /** Filter by collection IDs (V1 uses collections, not categories) */
    collectionIds?: string[];
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
    /** Page number for pagination (1-based) */
    page?: number;
    /** Items per page (default: 12) */
    pageSize?: number;
}

/**
 * Price range bucket for filter UI
 */
export interface PriceRangeBucket {
    rangeId: string;
    label: string;
    minValue: number | null;
    maxValue: number | null;
    isSelected: boolean;
}

/**
 * Price aggregation data for filter UI
 */
export interface PriceAggregationData {
    /** Minimum price across all products */
    minBound: number;
    /** Maximum price across all products */
    maxBound: number;
    /** Computed price range buckets */
    ranges: PriceRangeBucket[];
}

/**
 * Generate "nice" round number boundaries for price buckets.
 * Uses logarithmic scale: 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, etc.
 */
function getNiceBoundaries(minPrice: number, maxPrice: number): number[] {
    const multipliers = [1, 2, 5];
    const boundaries: number[] = [];
    
    // Generate all nice numbers from 1 up to maxPrice
    let magnitude = 1;
    while (magnitude <= maxPrice * 10) {
        for (const mult of multipliers) {
            const value = magnitude * mult;
            if (value > minPrice && value < maxPrice) {
                boundaries.push(value);
            }
        }
        magnitude *= 10;
    }
    
    return boundaries.sort((a, b) => a - b);
}

/**
 * Generate price buckets with logarithmic-style "nice" boundaries.
 * - First bucket starts at actual min price
 * - Last bucket ends at actual max price
 * - Middle boundaries use nice round numbers (100, 200, 500, 1000, 2000, 5000, etc.)
 * 
 * @param minPrice - Minimum price in catalog
 * @param maxPrice - Maximum price in catalog
 * @param currencySymbol - Currency symbol for labels
 * @returns Array of price range buckets
 */
function generatePriceBuckets(minPrice: number, maxPrice: number, currencySymbol: string = '$'): PriceRangeBucket[] {
    if (maxPrice <= minPrice || maxPrice === 0) {
        return [{ rangeId: 'all', label: 'Show all', minValue: null, maxValue: null, isSelected: true }];
    }

    // Get nice boundaries between min and max
    let niceBoundaries = getNiceBoundaries(minPrice, maxPrice);
    
    // If too many boundaries, thin them out to get ~4-6 buckets
    while (niceBoundaries.length > 5) {
        // Remove every other boundary, keeping the more significant ones
        niceBoundaries = niceBoundaries.filter((_, i) => i % 2 === 0);
    }
    
    // Build bucket boundaries: [minPrice, ...niceBoundaries, maxPrice]
    const allBoundaries = [minPrice, ...niceBoundaries, maxPrice];
    
    // Generate buckets
    const buckets: PriceRangeBucket[] = [
        { rangeId: 'all', label: 'Show all', minValue: null, maxValue: null, isSelected: true }
    ];
    
    for (let i = 0; i < allBoundaries.length - 1; i++) {
        const from = Math.round(allBoundaries[i]);
        const to = Math.round(allBoundaries[i + 1]);
        
        if (from < to) {
            const label = `${currencySymbol}${from} - ${currencySymbol}${to}`;
            buckets.push({
                rangeId: `${from}-${to}`,
                label,
                minValue: from,
                maxValue: to,
                isSelected: false
            });
        }
    }
    
    return buckets;
}

/**
 * Output for searchProducts action
 */
export interface SearchProductsOutput {
    /** List of matching products */
    products: ProductCardViewState[];
    /** Total number of matching products */
    totalCount: number;
    /** Current page number */
    currentPage: number;
    /** Total number of pages */
    totalPages: number;
    /** Whether there are more results */
    hasMore: boolean;
    /** Price aggregation data (bounds and computed ranges) */
    priceAggregation: PriceAggregationData;
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
 * Search products using the Wix Stores Catalog V1 queryProducts API.
 *
 * V1 uses skip-based pagination and query builder syntax.
 * 
 * Server-side filtering/sorting:
 * - name: startsWith() for text search
 * - collectionIds: hasSome() for collection filtering
 * - priceData.price: ge()/le() for price range filtering
 * - Sorting: ascending()/descending() on price, name, lastUpdated
 * 
 * Also fetches min/max prices in parallel for price range filter UI.
 *
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/products/query-products
 *
 * @example
 * ```typescript
 * const results = await searchProducts({
 *     query: 'whisky',
 *     filters: { minPrice: 50, maxPrice: 200 },
 *     sortBy: 'price_asc',
 *     pageSize: 12,
 *     page: 1
 * });
 * // results.priceAggregation = {
 * //   minBound: 25,
 * //   maxBound: 500,
 * //   ranges: [
 * //     { rangeId: 'all', label: 'Show all', minValue: null, maxValue: null, isSelected: true },
 * //     { rangeId: '0-100', label: '$0 - $100', minValue: 0, maxValue: 100, isSelected: false },
 * //     { rangeId: '100-200', label: '$100 - $200', ... },
 * //     ...
 * //   ]
 * // }
 * ```
 */
export const searchProducts = makeJayQuery('wixStoresV1.searchProducts')
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withHandler(async (
        input: SearchProductsInput,
        wixStores: WixStoresV1Service
    ): Promise<SearchProductsOutput> => {
        const {
            query,
            filters = {},
            sortBy = 'relevance',
            page = 1,
            pageSize = 12
        } = input;

        try {
            // Build base query with shared filters (name search, collection)
            const buildBaseQuery = () => {
                let q = wixStores.products.queryProducts();
                
                // Add name search if query provided
                if (query && query.trim().length > 0) {
                    q = q.startsWith('name', query.trim());
                }
                
                // Filter by collection if specified
                if (filters.collectionIds && filters.collectionIds.length > 0) {
                    q = q.hasSome('collectionIds', filters.collectionIds);
                }
                
                return q;
            };

            // Main products query with pagination, price filters, and sorting
            const buildProductsQuery = () => {
                let q = buildBaseQuery()
                    .limit(pageSize)
                    .skip((page - 1) * pageSize);

                // Server-side price filtering
                if (filters.minPrice !== undefined && filters.minPrice > 0) {
                    q = q.ge('priceData.price', filters.minPrice);
                }
                if (filters.maxPrice !== undefined && filters.maxPrice > 0) {
                    q = q.le('priceData.price', filters.maxPrice);
                }

                // Apply sorting
                // Note: Use 'price' field for sorting (priceData.price doesn't work for sorting)
                switch (sortBy) {
                    case 'price_asc':
                        q = q.ascending('price');
                        break;
                    case 'price_desc':
                        q = q.descending('price');
                        break;
                    case 'name_asc':
                        q = q.ascending('name');
                        break;
                    case 'name_desc':
                        q = q.descending('name');
                        break;
                    case 'newest':
                        q = q.descending('lastUpdated');
                        break;
                    // 'relevance' - no sort, use default order
                }

                return q;
            };

            // Price range queries - get min and max prices for filter UI
            // These use the base filters (name, collection) but NOT the price filters
            // Note: Use 'price' field for sorting (priceData.price doesn't work for sorting)
            const minPriceQuery = buildBaseQuery()
                .ascending('price')
                .limit(1)
                .find();

            const maxPriceQuery = buildBaseQuery()
                .descending('price')
                .limit(1)
                .find();

            // Run all queries in parallel
            const [result, minPriceResult, maxPriceResult] = await Promise.all([
                buildProductsQuery().find(),
                minPriceQuery,
                maxPriceQuery
            ]);

            const products: Product[] = (result.items || []);

            // Extract price bounds from min/max queries
            // V1 API has price.price for the numeric value
            const minBound = minPriceResult.items?.[0]?.price?.price ?? minPriceResult.items?.[0]?.priceData?.price ?? 0;
            const maxBound = maxPriceResult.items?.[0]?.price?.price ?? maxPriceResult.items?.[0]?.priceData?.price ?? 0;

            // Get currency symbol from first product
            const currency = products[0]?.price?.currency || products[0]?.priceData?.currency || minPriceResult.items?.[0]?.price?.currency;
            const currencySymbol = currency === 'ILS' ? '₪' : 
                                   currency === 'USD' ? '$' :
                                   currency === 'EUR' ? '€' :
                                   currency === 'GBP' ? '£' : '$';

            // Generate price buckets from bounds
            const ranges = generatePriceBuckets(minBound, maxBound, currencySymbol);

            // Calculate pagination info
            const totalCount = result.totalCount ?? result.items?.length ?? 0;
            const totalPages = Math.ceil(totalCount / pageSize);

            // Map products to card view state
            const mappedProducts = products.map(p => mapProductToCard(p));

            return {
                products: mappedProducts,
                totalCount,
                currentPage: page,
                totalPages,
                hasMore: page < totalPages,
                priceAggregation: { minBound, maxBound, ranges }
            };
        } catch (error) {
            console.error('[wixStoresV1.searchProducts] Search failed:', error);
            throw new ActionError('SEARCH_FAILED', 'Failed to search products');
        }
    });


/**
 * Get a single product by its URL slug.
 *
 * @example
 * ```typescript
 * const product = await getProductBySlug({ slug: 'peat-s-beast-px-finish-54-1' });
 * ```
 */
export const getProductBySlug = makeJayQuery('wixStoresV1.getProductBySlug')
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withCaching({ maxAge: 300, staleWhileRevalidate: 600 }) // Cache for 5 min, stale for 10 min
    .withHandler(async (
        input: GetProductBySlugInput,
        wixStores: WixStoresV1Service
    ): Promise<ProductCardViewState | null> => {
        const { slug } = input;

        if (!slug) {
            throw new ActionError('INVALID_INPUT', 'Product slug is required');
        }

        try {
            // V1 doesn't have getProductBySlug - query by slug, then fall back to ID
            // (cart URLs use product IDs since item.url slugs may not match catalog slugs)
            let result = await wixStores.products.queryProducts()
                .eq('slug', slug)
                .limit(1)
                .find();

            if (!result.items?.length) {
                result = await wixStores.products.queryProducts()
                    .eq('_id', slug)
                    .limit(1)
                    .find();
            }

            const product: Product = result.items?.[0];
            if (!product) {
                return null;
            }

            return mapProductToCard(product);
        } catch (error) {
            console.error('[wixStoresV1.getProductBySlug] Failed to get product:', error);
            // Return null for not found instead of throwing
            return null;
        }
    });

/**
 * Get available collections for filtering.
 * V1 uses collections instead of categories.
 *
 * @example
 * ```typescript
 * const collections = await getCollections();
 * ```
 */
export const getCollections = makeJayQuery('wixStoresV1.getCollections')
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withCaching({ maxAge: 3600 }) // Cache collections for 1 hour
    .withHandler(async (
        _input: Record<string, never>,
        wixStores: WixStoresV1Service
    ): Promise<CollectionViewState[]> => {
        try {
            const result = await wixStores.collections.queryCollections().find();

            return (result.items || []).map(col => mapCollectionToViewState(col));
        } catch (error) {
            console.error('[wixStoresV1.getCollections] Failed to load collections:', error);
            throw new ActionError('LOAD_FAILED', 'Failed to load collections');
        }
    });
