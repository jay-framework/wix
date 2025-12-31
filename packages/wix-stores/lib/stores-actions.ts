/**
 * Server Actions for Wix Stores
 *
 * Provides RPC-style actions for client-side code to interact with the
 * Wix Stores Catalog V3 API.
 */

import { makeJayAction, makeJayQuery, ActionError } from '@jay-framework/fullstack-component';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from './stores-client/wix-stores-service';
import { AvailabilityStatus, ProductCardViewState } from './contracts/product-card.jay-contract';
import { mapProductToCard } from './utils/product-mapper';

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
    /** Page number (1-indexed) */
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
    /** Total number of pages */
    totalPages: number;
    /** Current page number */
    currentPage: number;
    /** Whether there are more results */
    hasNextPage: boolean;
}

/**
 * Input for getProductBySlug action
 */
export interface GetProductBySlugInput {
    /** Product URL slug */
    slug: string;
}

/**
 * Input for quick add to cart (from search results)
 */
export interface QuickAddToCartInput {
    /** Product ID to add */
    productId: string;
    /** Quantity to add (default: 1) */
    quantity?: number;
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
            page = 1,
            pageSize = 12
        } = input;

        try {
            // Use queryProducts for all queries
            let queryBuilder = wixStores.products.queryProducts({
                fields: ['CURRENCY']
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

            // Apply pagination - fetch more for client-side filtering
            queryBuilder = queryBuilder.limit(pageSize * 2);

            const queryResult = await queryBuilder.find();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let products: any[] = queryResult.items || [];

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

            // Apply pagination on filtered results
            const totalCount = mappedProducts.length;
            const startIndex = (page - 1) * pageSize;
            const paginatedProducts = mappedProducts.slice(startIndex, startIndex + pageSize);

            const totalPages = Math.ceil(totalCount / pageSize) || 1;

            return {
                products: paginatedProducts,
                totalCount,
                totalPages,
                currentPage: page,
                hasNextPage: page < totalPages
            };
        } catch (error) {
            console.error('[wixStores.searchProducts] Search failed:', error);
            throw new ActionError('SEARCH_FAILED', 'Failed to search products');
        }
    });

/**
 * Get all products (paginated) for browsing without search.
 *
 * @example
 * ```typescript
 * const products = await getAllProducts({ page: 1, pageSize: 12 });
 * ```
 */
export const getAllProducts = makeJayQuery('wixStores.getAllProducts')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(async (
        input: { page?: number; pageSize?: number; categoryId?: string },
        wixStores: WixStoresService
    ): Promise<SearchProductsOutput> => {
        const { page = 1, pageSize = 12 } = input;

        try {
            const queryBuilder = wixStores.products.queryProducts()
                .limit(pageSize);

            const result = await queryBuilder.find();
            const products = result.items || [];
            // Estimate total - if we got a full page, there might be more
            const totalCount = products.length < pageSize ? (page - 1) * pageSize + products.length : page * pageSize + 1;
            const totalPages = Math.ceil(totalCount / pageSize) || 1;

            return {
                products: products.map(p => mapProductToCard(p)),
                totalCount,
                totalPages,
                currentPage: page,
                hasNextPage: products.length === pageSize
            };
        } catch (error) {
            console.error('[wixStores.getAllProducts] Failed to load products:', error);
            throw new ActionError('LOAD_FAILED', 'Failed to load products');
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
            const result = await wixStores.products.getProductBySlug(slug, {
                fields: ['MEDIA_ITEMS_INFO']
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

/**
 * Quick add a product to cart (from search results or product cards).
 *
 * This is a simplified add-to-cart for products without variant selection.
 * For products with options/variants, use the full add-to-cart flow.
 *
 * Note: Requires @wix/ecom to be configured. Currently returns mock response.
 *
 * @example
 * ```typescript
 * const result = await quickAddToCart({ productId: 'prod-123', quantity: 2 });
 * ```
 */
export const quickAddToCart = makeJayAction('wixStores.quickAddToCart')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(async (
        input: QuickAddToCartInput,
        wixStores: WixStoresService
    ): Promise<{ success: boolean; cartItemId?: string; message?: string }> => {
        const { productId, quantity = 1 } = input;

        if (!productId) {
            throw new ActionError('INVALID_INPUT', 'Product ID is required');
        }

        if (quantity < 1) {
            throw new ActionError('INVALID_INPUT', 'Quantity must be at least 1');
        }

        try {
            // Verify product exists and is in stock
            const result = await wixStores.products.queryProducts()
                .eq('_id', productId)
                .find();

            const product = result.items?.[0];
            if (!product) {
                throw new ActionError('NOT_FOUND', 'Product not found');
            }

            if (product.inventory?.availabilityStatus === 'OUT_OF_STOCK') {
                throw new ActionError('OUT_OF_STOCK', 'Product is out of stock');
            }

            // TODO: Integrate with @wix/ecom currentCart API when configured
            // For now, return success - cart integration to be added
            console.log('[wixStores.quickAddToCart] Adding to cart:', { productId, quantity });

            return {
                success: true,
                message: `Added ${quantity} item(s) to cart`
            };
        } catch (error) {
            if (error instanceof ActionError) {
                throw error;
            }
            console.error('[wixStores.quickAddToCart] Failed to add to cart:', error);
            throw new ActionError('CART_ERROR', 'Failed to add to cart');
        }
    });
