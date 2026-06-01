/**
 * Server Actions for Wix Stores (Catalog V1)
 *
 * Provides RPC-style actions for client-side code to interact with the
 * Wix Stores Catalog V1 API via REST.
 */

import { makeJayQuery, ActionError } from '@jay-framework/fullstack-component';
import {
    WIX_STORES_V1_SERVICE_MARKER,
    WixStoresV1Service,
} from '../services/wix-stores-v1-service.js';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';
import {
    mapProductToCard,
    mapCollectionToViewState,
    CollectionViewState,
} from '../utils/product-mapper-v1.js';
import {
    queryProducts as queryProductsApi,
    queryCollections as queryCollectionsApi,
} from '../wix-apis/index.js';
import type { WixFilter } from '@jay-framework/wix-server-client';

// ============================================================================
// Types
// ============================================================================

export type ProductSortField =
    | 'relevance'
    | 'price_asc'
    | 'price_desc'
    | 'name_asc'
    | 'name_desc'
    | 'newest';

export interface ProductSearchFilters {
    minPrice?: number;
    maxPrice?: number;
    collectionIds?: string[];
}

export interface SearchProductsInput {
    query: string;
    filters?: ProductSearchFilters;
    sortBy?: ProductSortField;
    page?: number;
    pageSize?: number;
}

export interface PriceRangeBucket {
    rangeId: string;
    label: string;
    minValue: number | null;
    maxValue: number | null;
    isSelected: boolean;
}

export interface PriceAggregationData {
    minBound: number;
    maxBound: number;
    ranges: PriceRangeBucket[];
}

function getNiceBoundaries(minPrice: number, maxPrice: number): number[] {
    const multipliers = [1, 2, 5];
    const boundaries: number[] = [];
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

function generatePriceBuckets(
    minPrice: number,
    maxPrice: number,
    currencySymbol: string = '$',
): PriceRangeBucket[] {
    if (maxPrice <= minPrice || maxPrice === 0) {
        return [
            { rangeId: 'all', label: 'Show all', minValue: null, maxValue: null, isSelected: true },
        ];
    }
    let niceBoundaries = getNiceBoundaries(minPrice, maxPrice);
    while (niceBoundaries.length > 5) {
        niceBoundaries = niceBoundaries.filter((_, i) => i % 2 === 0);
    }
    const allBoundaries = [minPrice, ...niceBoundaries, maxPrice];
    const buckets: PriceRangeBucket[] = [
        { rangeId: 'all', label: 'Show all', minValue: null, maxValue: null, isSelected: true },
    ];
    for (let i = 0; i < allBoundaries.length - 1; i++) {
        const from = Math.round(allBoundaries[i]);
        const to = Math.round(allBoundaries[i + 1]);
        if (from < to) {
            buckets.push({
                rangeId: `${from}-${to}`,
                label: `${currencySymbol}${from} - ${currencySymbol}${to}`,
                minValue: from,
                maxValue: to,
                isSelected: false,
            });
        }
    }
    return buckets;
}

export interface SearchProductsOutput {
    products: ProductCardViewState[];
    totalCount: number;
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    priceAggregation: PriceAggregationData;
}

export interface GetProductBySlugInput {
    slug: string;
}

// ============================================================================
// Actions
// ============================================================================

function buildBaseFilter(query: string | undefined, filters: ProductSearchFilters): WixFilter {
    const conditions: WixFilter[] = [];

    if (query && query.trim().length > 0) {
        conditions.push({ name: { $startsWith: query.trim() } });
    }

    if (filters.collectionIds && filters.collectionIds.length > 0) {
        conditions.push({ 'collections.id': { $hasSome: filters.collectionIds } });
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
}

function buildPriceFilter(
    baseFilter: WixFilter,
    minPrice: number | undefined,
    maxPrice: number | undefined,
): WixFilter {
    const priceFilter: WixFilter = {};
    if (minPrice !== undefined && minPrice > 0) {
        priceFilter.price = { $gte: minPrice };
    }
    if (maxPrice !== undefined && maxPrice > 0) {
        const existing = priceFilter.price;
        priceFilter.price = typeof existing === 'object' && existing !== null
            ? { ...existing, $lte: maxPrice }
            : { $lte: maxPrice };
    }
    if (Object.keys(priceFilter).length === 0) return baseFilter;
    if (Object.keys(baseFilter).length === 0) return priceFilter;
    return { $and: [baseFilter, priceFilter] };
}

export const searchProducts = makeJayQuery('wixStoresV1.searchProducts')
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withHandler(
        async (
            input: SearchProductsInput,
            wixStores: WixStoresV1Service,
        ): Promise<SearchProductsOutput> => {
            const { query, filters = {}, sortBy = 'relevance', page = 1, pageSize = 12 } = input;

            try {
                const baseFilter = buildBaseFilter(query, filters);
                const fullFilter = buildPriceFilter(baseFilter, filters.minPrice, filters.maxPrice);

                const sort = [];
                switch (sortBy) {
                    case 'price_asc':
                        sort.push({ fieldName: 'price', order: 'ASC' as const });
                        break;
                    case 'price_desc':
                        sort.push({ fieldName: 'price', order: 'DESC' as const });
                        break;
                    case 'name_asc':
                        sort.push({ fieldName: 'name', order: 'ASC' as const });
                        break;
                    case 'name_desc':
                        sort.push({ fieldName: 'name', order: 'DESC' as const });
                        break;
                    case 'newest':
                        sort.push({ fieldName: 'lastUpdated', order: 'DESC' as const });
                        break;
                }

                const [result, minPriceResult, maxPriceResult] = await Promise.all([
                    queryProductsApi(wixStores.wixClient, {
                        filter: fullFilter,
                        sort: sort.length > 0 ? sort : undefined,
                        paging: { limit: pageSize, offset: (page - 1) * pageSize },
                    }),
                    queryProductsApi(wixStores.wixClient, {
                        filter: baseFilter,
                        sort: [{ fieldName: 'price', order: 'ASC' }],
                        paging: { limit: 1 },
                    }),
                    queryProductsApi(wixStores.wixClient, {
                        filter: baseFilter,
                        sort: [{ fieldName: 'price', order: 'DESC' }],
                        paging: { limit: 1 },
                    }),
                ]);

                const products = result.products || [];
                const minBound = minPriceResult.products?.[0]?.price?.price ?? 0;
                const maxBound = maxPriceResult.products?.[0]?.price?.price ?? 0;

                const currency = products[0]?.price?.currency || minPriceResult.products?.[0]?.price?.currency;
                const currencySymbol =
                    currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

                const ranges = generatePriceBuckets(minBound, maxBound, currencySymbol);
                const totalCount = result.totalResults ?? products.length;
                const totalPages = Math.ceil(totalCount / pageSize);
                const mappedProducts = products.map((p) => mapProductToCard(p));

                return {
                    products: mappedProducts,
                    totalCount,
                    currentPage: page,
                    totalPages,
                    hasMore: page < totalPages,
                    priceAggregation: { minBound, maxBound, ranges },
                };
            } catch (error) {
                console.error('[wixStoresV1.searchProducts] Search failed:', error);
                throw new ActionError('SEARCH_FAILED', 'Failed to search products');
            }
        },
    );

export const getProductBySlug = makeJayQuery('wixStoresV1.getProductBySlug')
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withCaching({ maxAge: 300, staleWhileRevalidate: 600 })
    .withHandler(
        async (
            input: GetProductBySlugInput,
            wixStores: WixStoresV1Service,
        ): Promise<ProductCardViewState | null> => {
            const { slug } = input;
            if (!slug) {
                throw new ActionError('INVALID_INPUT', 'Product slug is required');
            }
            try {
                let result = await queryProductsApi(wixStores.wixClient, {
                    filter: { slug },
                    paging: { limit: 1 },
                });

                if (!result.products?.length) {
                    result = await queryProductsApi(wixStores.wixClient, {
                        filter: { id: slug },
                        paging: { limit: 1 },
                    });
                }

                const product = result.products?.[0];
                if (!product) return null;
                return mapProductToCard(product);
            } catch (error) {
                console.error('[wixStoresV1.getProductBySlug] Failed to get product:', error);
                return null;
            }
        },
    );

export const getCollections = makeJayQuery('wixStoresV1.getCollections')
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withCaching({ maxAge: 3600 })
    .withHandler(
        async (
            _input: Record<string, never>,
            wixStores: WixStoresV1Service,
        ): Promise<CollectionViewState[]> => {
            try {
                const result = await queryCollectionsApi(wixStores.wixClient);
                return (result.collections || []).map((col) => mapCollectionToViewState(col));
            } catch (error) {
                console.error('[wixStoresV1.getCollections] Failed to load collections:', error);
                throw new ActionError('LOAD_FAILED', 'Failed to load collections');
            }
        },
    );
