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
    /** Only show products in stock */
    inStockOnly?: boolean;
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
 * V1 uses skip-based pagination and different query syntax.
 * Note: V1 API has limited server-side filtering compared to V3.
 *
 * @example
 * ```typescript
 * const results = await searchProducts({
 *     query: 'whisky',
 *     filters: { inStockOnly: true },
 *     sortBy: 'price_asc',
 *     pageSize: 12,
 *     page: 1
 * });
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
            // Build query using V1 queryProducts API
            let productQuery = wixStores.products.queryProducts()
                .limit(pageSize)
                .skip((page - 1) * pageSize);

            // Add name search if query provided
            // V1 uses startsWith or contains for name search
            if (query && query.trim().length > 0) {
                productQuery = productQuery.startsWith('name', query.trim());
            }

            // Filter by collection if specified
            if (filters.collectionIds && filters.collectionIds.length > 0) {
                productQuery = productQuery.hasSome('collectionIds', filters.collectionIds);
            }

            // Apply sorting
            // V1 sort syntax is different from V3
            switch (sortBy) {
                case 'price_asc':
                    productQuery = productQuery.ascending('priceData.price');
                    break;
                case 'price_desc':
                    productQuery = productQuery.descending('priceData.price');
                    break;
                case 'name_asc':
                    productQuery = productQuery.ascending('name');
                    break;
                case 'name_desc':
                    productQuery = productQuery.descending('name');
                    break;
                case 'newest':
                    productQuery = productQuery.descending('lastUpdated');
                    break;
                // 'relevance' - no sort, use default order
            }

            const result = await productQuery.find();

            // Get all products for filtering
            let products: Product[] = (result.items || []);

            // Client-side filtering for features V1 API doesn't support server-side
            if (filters.inStockOnly) {
                products = products.filter(p => p.stock?.inStock === true);
            }
            if (filters.minPrice !== undefined && filters.minPrice > 0) {
                products = products.filter(p => (p.price?.discountedPrice || 0) >= filters.minPrice!);
            }
            if (filters.maxPrice !== undefined && filters.maxPrice > 0) {
                products = products.filter(p => (p.price?.discountedPrice || 0) <= filters.maxPrice!);
            }

            // Calculate pagination info
            // V1 doesn't always return total count, estimate from results
            const totalCount = result.totalCount ?? result.items?.length ?? 0;
            const totalPages = Math.ceil(totalCount / pageSize);

            // Map products to card view state
            const mappedProducts = products.map(p => mapProductToCard(p));

            return {
                products: mappedProducts,
                totalCount,
                currentPage: page,
                totalPages,
                hasMore: page < totalPages
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
            // V1 doesn't have getProductBySlug - query by slug instead
            const result = await wixStores.products.queryProducts()
                .eq('slug', slug)
                .limit(1)
                .find();

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
