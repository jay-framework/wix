import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
    UrlParams,
} from '@jay-framework/fullstack-component';
import { createSignal, createEffect, Props } from '@jay-framework/component';
import {
    CurrentSort,
    ProductSearchContract,
    ProductSearchFastViewState,
    ProductSearchInteractiveViewState,
    ProductSearchRefs,
    ProductSearchSlowViewState,
} from '../contracts/product-search.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import { patch, REPLACE, ADD } from '@jay-framework/json-patch';
import { searchProducts, ProductSortField } from '../actions/stores-actions';
import { mapProductToCard } from '../utils/product-mapper';
import { WIX_STORES_CONTEXT, WixStoresContext } from '../contexts/wix-stores-context';

/**
 * URL parameters for product search routes.
 * When used as a category listing, `category` is the prefix slug (e.g., 'polgat').
 */
export interface ProductSearchParams extends UrlParams {
    /** Category prefix slug. When present, scopes search to this category hierarchy. */
    category?: string;
}

/**
 * Search sort options
 */
export type SearchSortOption =
    | 'relevance'
    | 'priceAsc'
    | 'priceDesc'
    | 'newest'
    | 'nameAsc'
    | 'nameDesc';

/**
 * Category info carried forward from slow to fast phase
 */
type CategoryInfos = ProductSearchSlowViewState['filters']['categoryFilter']['categories'];

/**
 * Data carried forward from slow rendering to fast rendering
 */
interface SearchSlowCarryForward {
    searchFields: string;
    fuzzySearch: boolean;
    categories: CategoryInfos;
    /** Root category ID when scoped to a category prefix (always applied, hidden from UI) */
    baseCategoryId: string | null;
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface SearchFastCarryForward {
    searchFields: string;
    fuzzySearch: boolean;
    categories: CategoryInfos;
    /** Root category ID when scoped to a category prefix (always applied, hidden from UI) */
    baseCategoryId: string | null;
}

const PAGE_SIZE = 12;

/**
 * Slow Rendering Phase
 * Loads semi-static configuration:
 * - Search field configuration
 * - Fuzzy search settings
 * - Available categories for filtering (relatively static)
 */
async function renderSlowlyChanging(
    props: PageProps & ProductSearchParams,
    wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<ProductSearchSlowViewState, SearchSlowCarryForward>();

    // Resolve category prefix to root category ID
    const categoryPrefix = props.category;
    const categoryConfig = categoryPrefix
        ? wixStores.categoryPrefixes.find((c) => c.prefix === categoryPrefix)
        : null;
    const baseCategoryId = categoryConfig?.categoryId ?? null;

    return Pipeline.try(async () => {
        let query = wixStores.categories
            .queryCategories({
                treeReference: { appNamespace: '@wix/stores' },
            })
            .eq('visible', true);

        // When scoped to a category prefix, show only direct children of the root
        if (baseCategoryId) {
            query = query.eq('parentCategory.id', baseCategoryId);
        }

        const categoriesResult = await query.find();
        return categoriesResult.items || [];
    })
        .recover((error) => {
            console.error('Failed to load categories:', error);
            return Pipeline.ok([]);
        })
        .toPhaseOutput((categories) => {
            const categoryInfos: CategoryInfos = categories.map((cat) => ({
                categoryId: cat._id || '',
                categoryName: cat.name || '',
                categorySlug: cat.slug || '',
            }));

            return {
                viewState: {
                    searchFields: 'name,description,sku',
                    fuzzySearch: true,
                    emptyStateMessage: 'Enter a search term to find products',
                    filters: {
                        categoryFilter: {
                            categories: categoryInfos,
                        },
                    },
                },
                carryForward: {
                    searchFields: 'name,description,sku',
                    fuzzySearch: true,
                    categories: categoryInfos,
                    baseCategoryId,
                },
            };
        });
}

/**
 * Fast Rendering Phase
 * Loads dynamic data per request:
 * - Initial products (via searchProducts for aggregation support)
 * - Price bounds and ranges from aggregations
 * - Load more state
 */
async function renderFastChanging(
    props: PageProps & ProductSearchParams,
    slowCarryForward: SearchSlowCarryForward,
    _wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<ProductSearchFastViewState, SearchFastCarryForward>();

    return Pipeline.try(async () => {
        // Use searchProducts action to get products with aggregations
        // When scoped to a category, apply the root category as base filter
        const baseCategoryIds = slowCarryForward.baseCategoryId
            ? [slowCarryForward.baseCategoryId]
            : [];
        const result = await searchProducts({
            query: '',
            filters: baseCategoryIds.length > 0 ? { categoryIds: baseCategoryIds } : undefined,
            pageSize: PAGE_SIZE,
        });

        return result;
    })
        .recover((error) => {
            console.error('Failed to load products:', error);
            return Pipeline.ok({
                products: [],
                totalCount: 0,
                nextCursor: null,
                hasMore: false,
                priceAggregation: {
                    minBound: 0,
                    maxBound: 1000,
                    ranges: [
                        {
                            rangeId: 'all',
                            label: 'Show all',
                            minValue: null,
                            maxValue: null,
                            productCount: 0,
                            isSelected: true,
                        },
                    ],
                },
            });
        })
        .toPhaseOutput((result) => {
            const priceAgg = result.priceAggregation || {
                minBound: 0,
                maxBound: 1000,
                ranges: [
                    {
                        rangeId: 'all',
                        label: 'Show all',
                        minValue: null,
                        maxValue: null,
                        productCount: result.totalCount,
                        isSelected: true,
                    },
                ],
            };

            return {
                viewState: {
                    searchExpression: '',
                    isSearching: false,
                    hasSearched: false,
                    searchResults: result.products,
                    resultCount: result.products.length,
                    hasResults: result.products.length > 0,
                    hasSuggestions: false,
                    suggestions: [],
                    filters: {
                        inStockOnly: false,
                        priceRange: {
                            // Initialize sliders to full range (bounds)
                            minPrice: priceAgg.minBound,
                            maxPrice: priceAgg.maxBound,
                            minBound: priceAgg.minBound,
                            maxBound: priceAgg.maxBound,
                            ranges: priceAgg.ranges,
                        },
                        categoryFilter: {
                            categories: slowCarryForward.categories.map((cat) => ({
                                categoryId: cat.categoryId,
                                isSelected: false,
                            })),
                        },
                    },
                    sortBy: {
                        currentSort: CurrentSort.relevance,
                    },
                    hasMore: result.hasMore,
                    loadedCount: result.products.length,
                    totalCount: result.totalCount,
                },
                carryForward: {
                    searchFields: slowCarryForward.searchFields,
                    fuzzySearch: slowCarryForward.fuzzySearch,
                    categories: slowCarryForward.categories,
                    baseCategoryId: slowCarryForward.baseCategoryId,
                },
            };
        });
}

/**
 * Interactive Phase (Client-Side)
 * Handles user interactions:
 * - Search input and submission
 * - Filtering (categories, price, stock)
 * - Sorting
 * - Load more button
 * - Search suggestions
 *
 * All state updates use immutable patterns with the patch utility.
 */
function ProductSearchInteractive(
    props: Props<PageProps & ProductSearchParams>,
    refs: ProductSearchRefs,
    viewStateSignals: Signals<ProductSearchFastViewState>,
    fastCarryForward: SearchFastCarryForward,
    storesContext: WixStoresContext,
) {
    // Base category filter — always applied when scoped to a category prefix
    const baseCategoryId = fastCarryForward.baseCategoryId;

    const {
        searchExpression: [searchExpression, setSearchExpression],
        isSearching: [isSearching, setIsSearching],
        hasSearched: [hasSearched, setHasSearched],
        searchResults: [searchResults, setSearchResults],
        resultCount: [resultCount, setResultCount],
        hasResults: [hasResults, setHasResults],
        hasSuggestions: [hasSuggestions, setHasSuggestions],
        suggestions: [suggestions, setSuggestions],
        filters: [filters, setFilters],
        sortBy: [sortBy, setSortBy],
        hasMore: [hasMore, setHasMore],
        loadedCount: [loadedCount, setLoadedCount],
        totalCount: [totalCount, setTotalCount],
    } = viewStateSignals;

    // Submitted search term - only updated when search button is clicked
    const [submittedSearchTerm, setSubmittedSearchTerm] = createSignal<string | null>(null);

    // Current cursor for load more (internal state, not in view state)
    let currentCursor: string | null = null;

    let isFirst = true;
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    let searchVersion = 0;
    const DEBOUNCE_MS = 300;

    // Map CurrentSort enum to action sort field
    const mapSortToAction = (sort: CurrentSort): ProductSortField => {
        switch (sort) {
            case CurrentSort.priceAsc:
                return 'price_asc';
            case CurrentSort.priceDesc:
                return 'price_desc';
            case CurrentSort.newest:
                return 'newest';
            case CurrentSort.nameAsc:
                return 'name_asc';
            case CurrentSort.nameDesc:
                return 'name_desc';
            default:
                return 'relevance';
        }
    };

    // Perform search (replaces results, resets cursor)
    const performSearch = async (
        version: number,
        searchTerm: string | null,
        currentFilters: ProductSearchFastViewState['filters'],
        currentSort: CurrentSort,
    ) => {
        setIsSearching(true);
        setHasSearched(true);

        try {
            // Combine base category (always active) with user-selected child categories
            const userSelectedCategoryIds = currentFilters.categoryFilter.categories
                .filter((c) => c.isSelected)
                .map((c) => c.categoryId);
            const categoryIds = baseCategoryId
                ? [baseCategoryId, ...userSelectedCategoryIds]
                : userSelectedCategoryIds;

            const result = await searchProducts({
                query: searchTerm || '',
                filters: {
                    minPrice: currentFilters.priceRange.minPrice || undefined,
                    maxPrice: currentFilters.priceRange.maxPrice || undefined,
                    categoryIds,
                    inStockOnly: currentFilters.inStockOnly,
                },
                sortBy: mapSortToAction(currentSort),
                // No cursor = start from beginning
                pageSize: PAGE_SIZE,
            });

            // Check if a newer search was started
            if (version !== searchVersion) {
                return;
            }

            setSearchResults(result.products);
            setResultCount(result.products.length);
            setTotalCount(result.totalCount);
            setLoadedCount(result.products.length);
            setHasMore(result.hasMore);
            setHasResults(result.products.length > 0);

            // Store cursor for load more
            currentCursor = result.nextCursor;
        } catch (error) {
            if (version === searchVersion) {
                console.error('Search failed:', error);
            }
        } finally {
            if (version === searchVersion) {
                setIsSearching(false);
            }
        }
    };

    // Load more (appends results using cursor)
    const performLoadMore = async () => {
        if (isSearching() || !hasMore() || !currentCursor) return;

        setIsSearching(true);

        try {
            const currentFilters = filters();
            const currentSort = sortBy().currentSort;
            const searchTerm = submittedSearchTerm();

            // Combine base category with user-selected child categories
            const userSelectedCategoryIds = currentFilters.categoryFilter.categories
                .filter((c) => c.isSelected)
                .map((c) => c.categoryId);
            const categoryIds = baseCategoryId
                ? [baseCategoryId, ...userSelectedCategoryIds]
                : userSelectedCategoryIds;

            const result = await searchProducts({
                query: searchTerm || '',
                filters: {
                    minPrice: currentFilters.priceRange.minPrice || undefined,
                    maxPrice: currentFilters.priceRange.maxPrice || undefined,
                    categoryIds,
                    inStockOnly: currentFilters.inStockOnly,
                },
                sortBy: mapSortToAction(currentSort),
                cursor: currentCursor,
                pageSize: PAGE_SIZE,
            });

            // Append new products to existing results
            const currentResults = searchResults();
            const newResults = [...currentResults, ...result.products];

            setSearchResults(newResults);
            setResultCount(newResults.length);
            setLoadedCount(newResults.length);
            setHasMore(result.hasMore);

            // Update cursor for next load
            currentCursor = result.nextCursor;
        } catch (error) {
            console.error('Load more failed:', error);
        } finally {
            setIsSearching(false);
        }
    };

    // Reactive search effect - runs when search parameters change
    createEffect(() => {
        const searchTerm = submittedSearchTerm();
        const currentFilters = filters();
        const currentSort = sortBy().currentSort;

        if (isFirst) {
            isFirst = false;
            return;
        }

        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }

        debounceTimeout = setTimeout(() => {
            searchVersion++;
            const version = searchVersion;
            performSearch(version, searchTerm, currentFilters, currentSort);
        }, DEBOUNCE_MS);
    });

    // Search input handler
    refs.searchExpression.oninput(({ event }) => {
        const value = (event.target as HTMLInputElement).value;
        setSearchExpression(value);
    });

    // Enter key triggers search
    refs.searchExpression.onkeydown(({ event }) => {
        if ((event as KeyboardEvent).key === 'Enter') {
            event.preventDefault();
            setSubmittedSearchTerm(searchExpression().trim());
        }
    });

    // Search button click
    refs.searchButton.onclick(() => {
        setSubmittedSearchTerm(searchExpression().trim());
    });

    // Clear search button
    refs.clearSearchButton.onclick(() => {
        setSearchExpression('');
        setSubmittedSearchTerm(null);
        setHasSearched(false);
    });

    // Sorting dropdown
    refs.sortBy.sortDropdown.oninput(({ event }) => {
        const value = (event.target as HTMLSelectElement).value;
        const sortMap: Record<string, CurrentSort> = {
            relevance: CurrentSort.relevance,
            priceAsc: CurrentSort.priceAsc,
            priceDesc: CurrentSort.priceDesc,
            newest: CurrentSort.newest,
            nameAsc: CurrentSort.nameAsc,
            nameDesc: CurrentSort.nameDesc,
        };
        const newSort = sortMap[value] ?? CurrentSort.relevance;
        setSortBy({ currentSort: newSort });
    });

    // Price range input filters (works for both number inputs and range sliders)
    refs.filters.priceRange.minPrice.oninput(({ event }) => {
        const value = parseFloat((event.target as HTMLInputElement).value);
        const newValue = isNaN(value) ? 0 : value;
        setFilters(
            patch(filters(), [{ op: REPLACE, path: ['priceRange', 'minPrice'], value: newValue }]),
        );
    });

    refs.filters.priceRange.maxPrice.oninput(({ event }) => {
        const value = parseFloat((event.target as HTMLInputElement).value);
        const newValue = isNaN(value) ? 0 : value;
        setFilters(
            patch(filters(), [{ op: REPLACE, path: ['priceRange', 'maxPrice'], value: newValue }]),
        );
    });

    // Price range radio buttons
    refs.filters.priceRange.ranges.isSelected.oninput(({ event, coordinate }) => {
        const [rangeId] = coordinate;
        const currentFilters = filters();
        const ranges = currentFilters.priceRange.ranges || [];
        const selectedRange = ranges.find((r) => r.rangeId === rangeId);

        if (!selectedRange) return;

        // Update all ranges: deselect all, select the clicked one
        const updatedRanges = ranges.map((r) => ({
            ...r,
            isSelected: r.rangeId === rangeId,
        }));

        // Set min/max based on selected range
        const newMinPrice = selectedRange.minValue ?? 0;
        const newMaxPrice = selectedRange.maxValue ?? 0;

        setFilters(
            patch(currentFilters, [
                { op: REPLACE, path: ['priceRange', 'ranges'], value: updatedRanges },
                { op: REPLACE, path: ['priceRange', 'minPrice'], value: newMinPrice },
                { op: REPLACE, path: ['priceRange', 'maxPrice'], value: newMaxPrice },
            ]),
        );
    });

    // Category filter checkboxes
    refs.filters.categoryFilter.categories.isSelected.oninput(({ event, coordinate }) => {
        const [categoryId] = coordinate;
        const currentFilters = filters();
        const categoryIndex = currentFilters.categoryFilter.categories.findIndex(
            (c) => c.categoryId === categoryId,
        );

        if (categoryIndex !== -1) {
            const isChecked = (event.target as HTMLInputElement).checked;
            setFilters(
                patch(currentFilters, [
                    {
                        op: REPLACE,
                        path: ['categoryFilter', 'categories', categoryIndex, 'isSelected'],
                        value: isChecked,
                    },
                ]),
            );
        }
    });

    // In stock only filter
    refs.filters.inStockOnly.oninput(({ event }) => {
        const isChecked = (event.target as HTMLInputElement).checked;
        setFilters(patch(filters(), [{ op: REPLACE, path: ['inStockOnly'], value: isChecked }]));
    });

    // Clear filters button
    refs.filters.clearFilters.onclick(() => {
        const currentFilters = filters();
        const clearedCategories = currentFilters.categoryFilter.categories.map((cat) => ({
            ...cat,
            isSelected: false,
        }));

        // Reset price ranges - select "Show all"
        const clearedRanges = (currentFilters.priceRange.ranges || []).map((r, i) => ({
            ...r,
            isSelected: i === 0, // First one is "Show all"
        }));

        setFilters({
            priceRange: {
                minPrice: 0,
                maxPrice: 0,
                minBound: currentFilters.priceRange.minBound,
                maxBound: currentFilters.priceRange.maxBound,
                ranges: clearedRanges,
            },
            categoryFilter: { categories: clearedCategories },
            inStockOnly: false,
        });
    });

    // Load more button
    refs.loadMoreButton.onclick(() => {
        performLoadMore();
    });

    // Suggestion clicks
    refs.suggestions.suggestionButton.onclick(({ coordinate }) => {
        const [suggestionId] = coordinate;
        const suggestion = suggestions().find((s) => s.suggestionId === suggestionId);
        if (suggestion) {
            setSearchExpression(suggestion.suggestionText);
            setSubmittedSearchTerm(suggestion.suggestionText);
        }
    });

    // Product card add to cart (SIMPLE products)
    refs.searchResults.addToCartButton.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;

        const currentResults = searchResults();
        const productIndex = currentResults.findIndex((p) => p._id === productId);
        if (productIndex === -1) return;

        setSearchResults(
            patch(currentResults, [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true },
            ]),
        );

        try {
            await storesContext.addToCart(productId, 1);
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setSearchResults(
                patch(searchResults(), [
                    { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false },
                ]),
            );
        }
    });

    // Quick option choice click (SINGLE_OPTION products)
    refs.searchResults.quickOption.choices.choiceButton.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;

        const currentResults = searchResults();
        const productIndex = currentResults.findIndex((p) => p._id === productId);
        if (productIndex === -1) return;

        const product = currentResults[productIndex];
        const choice = product.quickOption?.choices?.find((c) => c.choiceId === choiceId);

        if (!choice || !choice.inStock) {
            console.warn('Choice not available or out of stock');
            return;
        }

        setSearchResults(
            patch(currentResults, [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true },
            ]),
        );

        try {
            const optionId = product.quickOption._id;
            await storesContext.addToCart(productId, 1, {
                options: { [optionId]: choice.choiceId },
                modifiers: {},
                customTextFields: {},
            });
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setSearchResults(
                patch(searchResults(), [
                    { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false },
                ]),
            );
        }
    });

    // View options button (NEEDS_CONFIGURATION products)
    refs.searchResults.viewOptionsButton.onclick(({ coordinate }) => {
        const [productId] = coordinate;
        const product = searchResults().find((p) => p._id === productId);
        if (product?.productUrl) {
            window.location.href = product.productUrl;
        }
    });

    return {
        render: (): ProductSearchInteractiveViewState => ({
            searchExpression: searchExpression(),
            isSearching: isSearching(),
            hasSearched: hasSearched(),
            searchResults: searchResults(),
            resultCount: resultCount(),
            hasResults: hasResults(),
            hasSuggestions: hasSuggestions(),
            suggestions: suggestions(),
            filters: filters(),
            sortBy: sortBy(),
            hasMore: hasMore(),
            loadedCount: loadedCount(),
            totalCount: totalCount(),
        }),
    };
}

/**
 * Product Search Full-Stack Component
 *
 * A complete headless product search component with server-side rendering,
 * filtering, sorting, and "load more" functionality.
 *
 * Rendering phases:
 * - Slow: Categories for filtering (relatively static)
 * - Fast: Products, search results, load more state (dynamic per request)
 * - Interactive: Search input, filter selections, sorting, load more (client-side)
 *
 * Usage:
 * ```typescript
 * import { productSearch } from '@jay-framework/wix-stores';
 * ```
 */
export const productSearch = makeJayStackComponent<ProductSearchContract>()
    .withProps<PageProps & ProductSearchParams>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withContexts(WIX_STORES_CONTEXT)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductSearchInteractive);
