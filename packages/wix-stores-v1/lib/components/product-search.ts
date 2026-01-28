/**
 * Product Search Component (V1)
 * 
 * A complete headless product search component using Wix Catalog V1 API.
 * 
 * Key V1 differences:
 * - Uses collections instead of categories
 * - Uses skip-based pagination instead of cursor-based
 * - Different search and filtering approach
 */

import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals
} from '@jay-framework/fullstack-component';
import { createSignal, createEffect, Props } from '@jay-framework/component';
import {
    CurrentSort,
    ProductSearchContract,
    ProductSearchFastViewState,
    ProductSearchInteractiveViewState,
    ProductSearchRefs,
    ProductSearchSlowViewState
} from '../contracts/product-search.jay-contract';
import { WIX_STORES_V1_SERVICE_MARKER, WixStoresV1Service } from '../services/wix-stores-v1-service.js';
import { patch, REPLACE } from '@jay-framework/json-patch';
import { runAction } from '@jay-framework/stack-server-runtime';
import { searchProducts, ProductSortField } from '../actions/stores-v1-actions';
import { mapProductToCard } from '../utils/product-mapper-v1';
import { WIX_STORES_V1_CONTEXT, WixStoresV1Context } from '../contexts/wix-stores-v1-context';

/**
 * Collection info for filtering (V1 uses collections, not categories)
 */
type CollectionInfos = ProductSearchSlowViewState['filters']['categoryFilter']['categories'];

interface SearchSlowCarryForward {
    searchFields: string;
    fuzzySearch: boolean;
    collections: CollectionInfos;
}

interface SearchFastCarryForward {
    searchFields: string;
    fuzzySearch: boolean;
    collections: CollectionInfos;
}

const PAGE_SIZE = 12;

// ============================================================================
// Rendering Functions
// ============================================================================

/**
 * Slow Rendering Phase
 * Loads semi-static configuration:
 * - Available collections for filtering (V1 uses collections, not categories)
 */
async function renderSlowlyChanging(
    props: PageProps,
    wixStores: WixStoresV1Service
) {
    const Pipeline = RenderPipeline.for<ProductSearchSlowViewState, SearchSlowCarryForward>();

    return Pipeline
        .try(async () => {
            // Load collections for filtering (V1 API)
            const collectionsResult = await wixStores.collections.queryCollections().find();
            return collectionsResult.items || [];
        })
        .recover(error => {
            console.error('[ProductSearch V1] Failed to load collections:', error);
            return Pipeline.ok([]);
        })
        .toPhaseOutput(collections => {
            // Map collections to category filter structure (reuse same contract)
            const collectionInfos: CollectionInfos = collections.map((col) => ({
                categoryId: col._id || '',
                categoryName: col.name || '',
                categorySlug: col.slug || ''
            }));

            return {
                viewState: {
                    searchFields: 'name,description,sku',
                    fuzzySearch: false, // V1 doesn't support fuzzy search
                    emptyStateMessage: 'Enter a search term to find products',
                    filters: {
                        categoryFilter: {
                            categories: collectionInfos
                        }
                    }
                },
                carryForward: {
                    searchFields: 'name,description,sku',
                    fuzzySearch: false,
                    collections: collectionInfos
                }
            };
        });
}

/**
 * Fast Rendering Phase
 * Loads initial products
 */
async function renderFastChanging(
    props: PageProps,
    slowCarryForward: SearchSlowCarryForward,
    _wixStores: WixStoresV1Service
) {
    const Pipeline = RenderPipeline.for<ProductSearchFastViewState, SearchFastCarryForward>();

    return Pipeline
        .try(async () => {
            const result = await runAction(searchProducts, {
                query: '',
                pageSize: PAGE_SIZE,
                page: 1
            });
            return result;
        })
        .recover(error => {
            console.error('[ProductSearch V1] Failed to load products:', error);
            return Pipeline.ok({
                products: [],
                totalCount: 0,
                currentPage: 1,
                totalPages: 0,
                hasMore: false
            });
        })
        .toPhaseOutput((result) => {
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
                            minPrice: 0,
                            maxPrice: 0,
                            minBound: 0,
                            maxBound: 10000,
                            ranges: [{ rangeId: 'all', label: 'Show all', minValue: null, maxValue: null, productCount: result.totalCount, isSelected: true }]
                        },
                        categoryFilter: {
                            categories: slowCarryForward.collections.map(col => ({
                                categoryId: col.categoryId,
                                isSelected: false
                            }))
                        }
                    },
                    sortBy: {
                        currentSort: CurrentSort.relevance
                    },
                    hasMore: result.hasMore,
                    loadedCount: result.products.length,
                    totalCount: result.totalCount
                },
                carryForward: {
                    searchFields: slowCarryForward.searchFields,
                    fuzzySearch: slowCarryForward.fuzzySearch,
                    collections: slowCarryForward.collections
                }
            };
        });
}

// ============================================================================
// Interactive Phase
// ============================================================================

function ProductSearchInteractive(
    props: Props<PageProps>,
    refs: ProductSearchRefs,
    viewStateSignals: Signals<ProductSearchFastViewState>,
    fastCarryForward: SearchFastCarryForward,
    storesContext: WixStoresV1Context
) {

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
        totalCount: [totalCount, setTotalCount]
    } = viewStateSignals;

    const [submittedSearchTerm, setSubmittedSearchTerm] = createSignal<string | null>(null);
    const [currentPage, setCurrentPage] = createSignal(1);

    let isFirst = true;
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    let searchVersion = 0;
    const DEBOUNCE_MS = 300;

    const mapSortToAction = (sort: CurrentSort): ProductSortField => {
        switch (sort) {
            case CurrentSort.priceAsc: return 'price_asc';
            case CurrentSort.priceDesc: return 'price_desc';
            case CurrentSort.newest: return 'newest';
            case CurrentSort.nameAsc: return 'name_asc';
            case CurrentSort.nameDesc: return 'name_desc';
            default: return 'relevance';
        }
    };

    // Perform search (replaces results, resets page)
    const performSearch = async (
        version: number,
        searchTerm: string | null,
        currentFilters: ProductSearchFastViewState['filters'],
        currentSort: CurrentSort
    ) => {
        setIsSearching(true);
        setHasSearched(true);

        try {
            const result = await searchProducts({
                query: searchTerm || '',
                filters: {
                    minPrice: currentFilters.priceRange.minPrice || undefined,
                    maxPrice: currentFilters.priceRange.maxPrice || undefined,
                    collectionIds: currentFilters.categoryFilter.categories
                        .filter(c => c.isSelected)
                        .map(c => c.categoryId),
                    inStockOnly: currentFilters.inStockOnly
                },
                sortBy: mapSortToAction(currentSort),
                pageSize: PAGE_SIZE,
                page: 1
            });

            if (version !== searchVersion) return;

            setSearchResults(result.products);
            setResultCount(result.products.length);
            setTotalCount(result.totalCount);
            setLoadedCount(result.products.length);
            setHasMore(result.hasMore);
            setHasResults(result.products.length > 0);
            setCurrentPage(1);

        } catch (error) {
            if (version === searchVersion) {
                console.error('[ProductSearch V1] Search failed:', error);
            }
        } finally {
            if (version === searchVersion) {
                setIsSearching(false);
            }
        }
    };

    // Load more (V1 uses page-based pagination)
    const performLoadMore = async () => {
        if (isSearching() || !hasMore()) return;

        setIsSearching(true);

        try {
            const currentFilters = filters();
            const currentSort = sortBy().currentSort;
            const searchTerm = submittedSearchTerm();
            const nextPage = currentPage() + 1;

            const result = await searchProducts({
                query: searchTerm || '',
                filters: {
                    minPrice: currentFilters.priceRange.minPrice || undefined,
                    maxPrice: currentFilters.priceRange.maxPrice || undefined,
                    collectionIds: currentFilters.categoryFilter.categories
                        .filter(c => c.isSelected)
                        .map(c => c.categoryId),
                    inStockOnly: currentFilters.inStockOnly
                },
                sortBy: mapSortToAction(currentSort),
                page: nextPage,
                pageSize: PAGE_SIZE
            });

            const currentResults = searchResults();
            const newResults = [...currentResults, ...result.products];

            setSearchResults(newResults);
            setResultCount(newResults.length);
            setLoadedCount(newResults.length);
            setHasMore(result.hasMore);
            setCurrentPage(nextPage);

        } catch (error) {
            console.error('[ProductSearch V1] Load more failed:', error);
        } finally {
            setIsSearching(false);
        }
    };

    // Reactive search effect
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

    refs.searchExpression.onkeydown(({ event }) => {
        if ((event as KeyboardEvent).key === 'Enter') {
            event.preventDefault();
            setSubmittedSearchTerm(searchExpression().trim());
        }
    });

    refs.searchButton.onclick(() => {
        setSubmittedSearchTerm(searchExpression().trim());
    });

    refs.clearSearchButton.onclick(() => {
        setSearchExpression('');
        setSubmittedSearchTerm(null);
        setHasSearched(false);
    });

    refs.sortBy.sortDropdown.oninput(({ event }) => {
        const value = (event.target as HTMLSelectElement).value;
        const sortMap: Record<string, CurrentSort> = {
            'relevance': CurrentSort.relevance,
            'priceAsc': CurrentSort.priceAsc,
            'priceDesc': CurrentSort.priceDesc,
            'newest': CurrentSort.newest,
            'nameAsc': CurrentSort.nameAsc,
            'nameDesc': CurrentSort.nameDesc
        };
        const newSort = sortMap[value] ?? CurrentSort.relevance;
        setSortBy({ currentSort: newSort });
    });

    refs.filters.priceRange.minPrice.oninput(({ event }) => {
        const value = parseFloat((event.target as HTMLInputElement).value);
        const newValue = isNaN(value) ? 0 : value;
        setFilters(patch(filters(), [
            { op: REPLACE, path: ['priceRange', 'minPrice'], value: newValue }
        ]));
    });

    refs.filters.priceRange.maxPrice.oninput(({ event }) => {
        const value = parseFloat((event.target as HTMLInputElement).value);
        const newValue = isNaN(value) ? 0 : value;
        setFilters(patch(filters(), [
            { op: REPLACE, path: ['priceRange', 'maxPrice'], value: newValue }
        ]));
    });

    refs.filters.priceRange.ranges.isSelected.oninput(({ event, coordinate }) => {
        const [rangeId] = coordinate;
        const currentFilters = filters();
        const ranges = currentFilters.priceRange.ranges || [];
        const selectedRange = ranges.find(r => r.rangeId === rangeId);

        if (!selectedRange) return;

        const updatedRanges = ranges.map(r => ({
            ...r,
            isSelected: r.rangeId === rangeId
        }));

        const newMinPrice = selectedRange.minValue ?? 0;
        const newMaxPrice = selectedRange.maxValue ?? 0;

        setFilters(patch(currentFilters, [
            { op: REPLACE, path: ['priceRange', 'ranges'], value: updatedRanges },
            { op: REPLACE, path: ['priceRange', 'minPrice'], value: newMinPrice },
            { op: REPLACE, path: ['priceRange', 'maxPrice'], value: newMaxPrice }
        ]));
    });

    // Collection filter (using categoryFilter structure)
    refs.filters.categoryFilter.categories.isSelected.oninput(({ event, coordinate }) => {
        const [categoryId] = coordinate;
        const currentFilters = filters();
        const categoryIndex = currentFilters.categoryFilter.categories.findIndex(
            c => c.categoryId === categoryId
        );

        if (categoryIndex !== -1) {
            const isChecked = (event.target as HTMLInputElement).checked;
            setFilters(patch(currentFilters, [
                { op: REPLACE, path: ['categoryFilter', 'categories', categoryIndex, 'isSelected'], value: isChecked }
            ]));
        }
    });

    refs.filters.inStockOnly.oninput(({ event }) => {
        const isChecked = (event.target as HTMLInputElement).checked;
        setFilters(patch(filters(), [
            { op: REPLACE, path: ['inStockOnly'], value: isChecked }
        ]));
    });

    refs.filters.clearFilters.onclick(() => {
        const currentFilters = filters();
        const clearedCategories = currentFilters.categoryFilter.categories.map(cat => ({
            ...cat,
            isSelected: false
        }));

        const clearedRanges = (currentFilters.priceRange.ranges || []).map((r, i) => ({
            ...r,
            isSelected: i === 0
        }));

        setFilters({
            priceRange: {
                minPrice: 0,
                maxPrice: 0,
                minBound: currentFilters.priceRange.minBound,
                maxBound: currentFilters.priceRange.maxBound,
                ranges: clearedRanges
            },
            categoryFilter: { categories: clearedCategories },
            inStockOnly: false
        });
    });

    refs.loadMoreButton.onclick(() => {
        performLoadMore();
    });

    refs.suggestions?.suggestionButton?.onclick(({ coordinate }) => {
        const [suggestionId] = coordinate;
        const suggestion = suggestions().find(s => s.suggestionId === suggestionId);
        if (suggestion) {
            setSearchExpression(suggestion.suggestionText);
            setSubmittedSearchTerm(suggestion.suggestionText);
        }
    });

    // Product card add to cart
    refs.searchResults?.addToCartButton?.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;

        const currentResults = searchResults();
        const productIndex = currentResults.findIndex(p => p._id === productId);
        if (productIndex === -1) return;

        setSearchResults(patch(currentResults, [
            { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true }
        ]));

        try {
            await storesContext.addToCart(productId, 1);
        } catch (error) {
            console.error('[ProductSearch V1] Failed to add to cart:', error);
        } finally {
            setSearchResults(patch(searchResults(), [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false }
            ]));
        }
    });

    // Quick option choice click
    refs.searchResults?.quickOption?.choices?.choiceButton?.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;

        const currentResults = searchResults();
        const productIndex = currentResults.findIndex(p => p._id === productId);
        if (productIndex === -1) return;

        const product = currentResults[productIndex];
        const choice = product.quickOption?.choices?.find(c => c.choiceId === choiceId);

        if (!choice || !choice.inStock) {
            console.warn('[ProductSearch V1] Choice not available or out of stock');
            return;
        }

        setSearchResults(patch(currentResults, [
            { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true }
        ]));

        try {
            // For V1, use variantId from choice
            await storesContext.addToCart(productId, 1, choice.variantId);
        } catch (error) {
            console.error('[ProductSearch V1] Failed to add to cart:', error);
        } finally {
            setSearchResults(patch(searchResults(), [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false }
            ]));
        }
    });

    refs.searchResults?.viewOptionsButton?.onclick(({ coordinate }) => {
        const [productId] = coordinate;
        const product = searchResults().find(p => p._id === productId);
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
            totalCount: totalCount()
        })
    };
}

// ============================================================================
// Component Export
// ============================================================================

/**
 * Product Search Component (V1)
 *
 * A complete headless product search using Wix Catalog V1 API.
 * Uses collections for filtering and page-based pagination.
 */
export const productSearch = makeJayStackComponent<ProductSearchContract>()
    .withProps<PageProps>()
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withContexts(WIX_STORES_V1_CONTEXT)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductSearchInteractive);
