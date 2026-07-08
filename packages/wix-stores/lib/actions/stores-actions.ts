/**
 * Server Actions for Wix Stores
 *
 * Provides RPC-style actions for client-side code to interact with the
 * Wix Stores Catalog V3 API.
 */

import { makeJayQuery, ActionError } from '@jay-framework/fullstack-component';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';
import {
    mapProductToCard,
    buildVariantStockMap,
    type VariantStockMap,
} from '../utils/product-mapper.js';
import {
    searchProducts as searchProductsApi,
    getProductBySlug as getProductBySlugApi,
    getProduct as getProductApi,
    queryCategories as queryCategoriesApi,
} from '../wix-apis/index.js';
import type { SearchProductsRequest } from '../wix-apis/search-products.js';
import type {
    AggregationDataAggregationResults,
    AggregationDataAggregationResultsScalarResult,
    AggregationResultsRangeResults,
    AggregationResultsValueResults,
    Customization,
} from '../wix-apis/types.js';

/** Check if URL templates use category/prefix placeholders */
function needsCategoryInfo(wixStores: WixStoresService): boolean {
    const template = wixStores.urls.product;
    return template.includes('{category}') || template.includes('{prefix}');
}
import { SearchProductsInput, SearchProductsOutput } from './search-products.jay-action';

// ============================================================================
// Types
// ============================================================================

/**
 * Pre-computed wide-range price buckets using logarithmic scale.
 * Each power of 10 is divided into 3 buckets using multipliers 2, 4, 10.
 *
 * Boundaries: 0, 20, 40, 100, 200, 400, 1000, 2000, 4000, 10000...
 * Buckets: 0-20, 20-40, 40-100, 100-200, 200-400, 400-1000, etc.
 *
 * We request all buckets and filter out empty ones from the response.
 */
const PRICE_BUCKET_BOUNDARIES = [
    0, 20, 40, 100, 200, 400, 1000, 2000, 4000, 10000, 20000, 40000, 100000,
];

const PRICE_BUCKETS = PRICE_BUCKET_BOUNDARIES.slice(0, -1).map((from, i) => ({
    from,
    to: PRICE_BUCKET_BOUNDARIES[i + 1],
}));
// Add open-ended last bucket
PRICE_BUCKETS.push({ from: PRICE_BUCKET_BOUNDARIES[PRICE_BUCKET_BOUNDARIES.length - 1] } as {
    from: number;
    to: number;
});

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
 * Cross-reference search aggregation results with customizations to build
 * structured option filters. Options and choices are filtered to only include
 * those present in the current search results.
 */
function getAvailableProductOptions(
    aggResults: AggregationDataAggregationResults[],
    customizations: Customization[],
): SearchProductsOutput['optionFilters'] {
    const optionNamesAgg = aggResults.find((a) => a.name === 'optionNames')?.values as
        | AggregationResultsValueResults
        | undefined;
    const choiceNamesAgg = aggResults.find((a) => a.name === 'choiceNames')?.values as
        | AggregationResultsValueResults
        | undefined;

    if (!optionNamesAgg?.results?.length || !choiceNamesAgg?.results?.length) {
        return [];
    }

    const optionNames = new Set(optionNamesAgg.results.map((e) => e.value!));
    const choiceCounts = new Map(
        choiceNamesAgg.results.map((e) => [e.value!.toLowerCase(), e.count ?? 0]),
    );

    return customizations
        .filter(
            (c) =>
                c.customizationType === 'PRODUCT_OPTION' &&
                c.name &&
                optionNames.has(c.name) &&
                (c.customizationRenderType === 'TEXT_CHOICES' ||
                    c.customizationRenderType === 'SWATCH_CHOICES'),
        )
        .map((c) => ({
            optionId: c._id || '',
            optionName: c.name || '',
            optionRenderType: c.customizationRenderType as 'TEXT_CHOICES' | 'SWATCH_CHOICES',
            // Sort by product count descending (most used choices first)
            choices: (c.choicesSettings?.choices || [])
                .filter((ch) => ch.name && choiceCounts.has(ch.name.toLowerCase()))
                .map((ch) => ({
                    choiceId: ch._id || '',
                    choiceName: ch.name || '',
                    colorCode: ch.colorCode || '',
                    productCount: choiceCounts.get(ch.name!.toLowerCase()) ?? 0,
                }))
                .sort((a, b) => b.productCount - a.productCount),
        }))
        .filter((o) => o.choices.length > 0);
}

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
    .withHandler(
        async (
            input: SearchProductsInput,
            wixStores: WixStoresService,
        ): Promise<SearchProductsOutput> => {
            const { query, filters = {}, sortBy = 'relevance', cursor, pageSize = 12 } = input;

            try {
                // Build server-side filter object using $and to combine all conditions
                // See: https://dev.wix.com/docs/sdk/backend-modules/stores/catalog-v3/products-v3/search-products
                const filterConditions: Record<string, unknown>[] = [
                    // Only visible products
                    { visible: { $eq: true } },
                ];

                // Price range filters
                const hasMinPrice = filters.minPrice !== undefined && filters.minPrice > 0;
                const hasMaxPrice = filters.maxPrice !== undefined && filters.maxPrice > 0;

                if (hasMinPrice) {
                    filterConditions.push({
                        'actualPriceRange.minValue.amount': { $gte: String(filters.minPrice) },
                    });
                }
                if (hasMaxPrice) {
                    filterConditions.push({
                        'actualPriceRange.minValue.amount': { $lte: String(filters.maxPrice) },
                    });
                }

                // Stock status filter
                if (filters.inStockOnly) {
                    filterConditions.push({
                        'inventory.availabilityStatus': { $eq: 'IN_STOCK' },
                    });
                }

                // Category filter
                if (filters.categoryIds && filters.categoryIds.length > 0) {
                    filterConditions.push({
                        'allCategoriesInfo.categories.id': {
                            $hasAll: filters.categoryIds,
                        },
                    });
                }

                // Option filters (OR within option, AND across options)
                if (filters.optionFilters && filters.optionFilters.length > 0) {
                    for (const optFilter of filters.optionFilters) {
                        if (optFilter.choiceNames.length > 0) {
                            filterConditions.push({
                                $and: [
                                    { 'options.name': { $hasSome: [optFilter.optionName] } },
                                    {
                                        'options.choicesSettings.choices.name': {
                                            $hasSome: optFilter.choiceNames,
                                        },
                                    },
                                ],
                            });
                        }
                    }
                }

                // Combine all conditions with $and
                const filter: Record<string, unknown> =
                    filterConditions.length === 1
                        ? filterConditions[0]
                        : { $and: filterConditions };

                // Build sort array
                const sort = [];
                switch (sortBy) {
                    case 'price_asc':
                        sort.push({ fieldName: 'actualPriceRange.minValue.amount', order: 'ASC' });
                        break;
                    case 'price_desc':
                        sort.push({ fieldName: 'actualPriceRange.minValue.amount', order: 'DESC' });
                        break;
                    case 'name_asc':
                        sort.push({ fieldName: 'name', order: 'ASC' });
                        break;
                    case 'name_desc':
                        sort.push({ fieldName: 'name', order: 'DESC' });
                        break;
                    case 'newest':
                        sort.push({ fieldName: '_createdDate', order: 'DESC' });
                        break;
                    // 'relevance' - no sort, use search relevance
                }

                // Build cursor paging
                const cursorPaging = cursor ? { cursor, limit: pageSize } : { limit: pageSize };

                // Build search expression (for text search)
                const hasSearchQuery = query && query.trim().length > 0;

                const search = hasSearchQuery
                    ? {
                          expression: query.trim(),
                          fields: ['name', 'description'] as ('name' | 'description')[],
                      }
                    : undefined;

                // Build aggregations for price bounds, buckets, and total count
                const aggregations: SearchProductsRequest['aggregations'] = [
                    // Total count via COUNT_DISTINCT on slug
                    {
                        fieldPath: 'slug',
                        name: 'total-count',
                        type: 'SCALAR' as const,
                        scalar: { type: 'COUNT_DISTINCT' as const },
                    },
                    // Price buckets with product counts
                    {
                        fieldPath: 'actualPriceRange.minValue.amount',
                        name: 'price-buckets',
                        type: 'RANGE' as const,
                        range: { buckets: PRICE_BUCKETS },
                    },
                    // Min price for slider bound
                    {
                        fieldPath: 'actualPriceRange.minValue.amount',
                        name: 'min-price',
                        type: 'SCALAR' as const,
                        scalar: { type: 'MIN' as const },
                    },
                    // Max price for slider bound
                    {
                        fieldPath: 'actualPriceRange.minValue.amount',
                        name: 'max-price',
                        type: 'SCALAR' as const,
                        scalar: { type: 'MAX' as const },
                    },
                    // Option names for option-based filtering
                    {
                        fieldPath: 'options.name',
                        name: 'optionNames',
                        type: 'VALUE' as const,
                        value: {
                            limit: 20,
                            sortType: 'VALUE' as const,
                            sortDirection: 'DESC' as const,
                        },
                    },
                    // Choice names for option-based filtering
                    {
                        fieldPath: 'options.choicesSettings.choices.name',
                        name: 'choiceNames',
                        type: 'VALUE' as const,
                        value: {
                            limit: 50,
                            sortType: 'COUNT' as const,
                            sortDirection: 'DESC' as const,
                        },
                    },
                ];

                // Call searchProducts (includes aggregations for count, price bounds, and buckets)
                const searchResult = await searchProductsApi(
                    wixStores.wixClient,
                    {
                        filter,
                        sort: sort.length > 0 ? sort : undefined,
                        cursorPaging,
                        search,
                        aggregations,
                    },
                    {
                        fields: [
                            'CURRENCY',
                            'VARIANT_OPTION_CHOICE_NAMES',
                            ...(needsCategoryInfo(wixStores)
                                ? (['ALL_CATEGORIES_INFO'] as const)
                                : []),
                        ],
                    },
                );

                const products = searchResult.products || [];
                const nextCursor = searchResult.pagingMetadata?.cursors?.next || null;

                // Extract aggregation results
                const aggResults: AggregationDataAggregationResults[] =
                    searchResult.aggregationData?.results || [];
                const totalCountAgg = aggResults.find((a) => a.name === 'total-count')
                    ?.scalar as AggregationDataAggregationResultsScalarResult;
                const minPriceAgg = aggResults.find((a) => a.name === 'min-price')
                    ?.scalar as AggregationDataAggregationResultsScalarResult;
                const maxPriceAgg = aggResults.find((a) => a.name === 'max-price')
                    ?.scalar as AggregationDataAggregationResultsScalarResult;

                const totalCount = totalCountAgg?.value ?? products.length;
                const bucketsAgg = aggResults.find((a) => a.name === 'price-buckets')
                    .ranges as AggregationResultsRangeResults;

                const minBound = minPriceAgg?.value;
                const maxBound = maxPriceAgg?.value;
                const buckets = bucketsAgg.results || [];

                // Get currency symbol from first product
                const currencySymbol =
                    products[0]?.currency === 'ILS'
                        ? '₪'
                        : products[0]?.currency === 'USD'
                          ? '$'
                          : products[0]?.currency === 'EUR'
                            ? '€'
                            : products[0]?.currency === 'GBP'
                              ? '£'
                              : '$';

                // Map price ranges from aggregation
                const priceRanges: SearchProductsOutput['priceAggregation']['ranges'] = [
                    {
                        rangeId: 'all',
                        label: 'Show all',
                        minValue: null,
                        maxValue: null,
                        productCount: totalCount,
                        isSelected: true,
                    },
                ];

                const bucketRanges = buckets
                    .filter((bucket) => (bucket.count ?? 0) > 0)
                    .map((bucket) => {
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
                            isSelected: false,
                        };
                    });

                priceRanges.push(...bucketRanges);

                // Build option filters from aggregation + customizations
                const customizations = await wixStores.getCustomizations();
                const optionFilters = getAvailableProductOptions(aggResults, customizations);

                // Map products to card view state with URL resolution
                const tree = await wixStores.getCategoryTree();
                const mappedProducts = products.map((p) =>
                    mapProductToCard(p, wixStores.urls, tree),
                );

                return {
                    products: mappedProducts,
                    totalCount,
                    nextCursor,
                    hasMore: nextCursor !== null,
                    priceAggregation: {
                        minBound,
                        maxBound,
                        ranges: priceRanges,
                    },
                    optionFilters,
                };
            } catch (error) {
                console.error('[wixStores.searchProducts] Search failed:', error);
                throw new ActionError('SEARCH_FAILED', 'Failed to search products');
            }
        },
    );

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
    .withHandler(
        async (
            input: GetProductBySlugInput,
            wixStores: WixStoresService,
        ): Promise<ProductCardViewState | null> => {
            const { slug } = input;

            if (!slug) {
                throw new ActionError('INVALID_INPUT', 'Product slug is required');
            }

            try {
                const fields = [
                    'MEDIA_ITEMS_INFO',
                    'VARIANT_OPTION_CHOICE_NAMES',
                    'CURRENCY',
                    ...(needsCategoryInfo(wixStores) ? (['ALL_CATEGORIES_INFO'] as const) : []),
                ] as const;
                const result = await getProductBySlugApi(wixStores.wixClient, slug, {
                    includeMerchantSpecificData: true,
                    fields: [...fields],
                });
                const product = result.product;

                if (!product) {
                    return null;
                }

                const tree = await wixStores.getCategoryTree();
                return mapProductToCard(product, wixStores.urls, tree);
            } catch (error) {
                console.error('[wixStores.getProductBySlug] Failed to get product:', error);
                // Return null for not found instead of throwing
                return null;
            }
        },
    );

/**
 * Get variant stock availability for a COLOR_AND_TEXT_OPTIONS product.
 * Fetches full product data and builds a stock map: colorChoiceId -> textChoiceId -> inStock.
 */
export const getVariantStock = makeJayQuery('wixStores.getVariantStock')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(
        async (
            input: { productId: string },
            wixStores: WixStoresService,
        ): Promise<VariantStockMap> => {
            try {
                const result = await getProductApi(wixStores.wixClient, input.productId, {
                    includeMerchantSpecificData: true,
                    fields: ['VARIANT_OPTION_CHOICE_NAMES'],
                });
                if (!result.product) return {};
                return buildVariantStockMap(result.product);
            } catch (error) {
                console.error('[wixStores.getVariantStock] Failed:', error);
                return {};
            }
        },
    );

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
    .withHandler(
        async (
            _input: Record<string, never>,
            wixStores: WixStoresService,
        ): Promise<Array<{ categoryId: string; categoryName: string }>> => {
            try {
                const result = await queryCategoriesApi(wixStores.wixClient, {
                    filter: { visible: true },
                });

                return (result.categories || []).map((cat) => ({
                    categoryId: cat._id || '',
                    categoryName: cat.name || '',
                }));
            } catch (error) {
                console.error('[wixStores.getCategories] Failed to load categories:', error);
                throw new ActionError('LOAD_FAILED', 'Failed to load categories');
            }
        },
    );
