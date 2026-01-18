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
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import { patch, REPLACE, ADD } from '@jay-framework/json-patch';
import { searchProducts, ProductSortField } from '../actions/stores-actions';
import { mapProductToCard } from '../utils/product-mapper';
import { WIX_STORES_CONTEXT, WixStoresContext } from '../contexts/wix-stores-context';

/**
 * Search sort options
 */
export type SearchSortOption = 'relevance' | 'priceAsc' | 'priceDesc' | 'newest' | 'nameAsc' | 'nameDesc';

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
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface SearchFastCarryForward {
    searchFields: string;
    fuzzySearch: boolean;
    categories: CategoryInfos;
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
    props: PageProps,
    wixStores: WixStoresService
) {
    const Pipeline = RenderPipeline.for<ProductSearchSlowViewState, SearchSlowCarryForward>();

    return Pipeline
        .try(async () => {
            // Load categories for filtering (Catalog V3 API)
            const categoriesResult = await wixStores.categories.queryCategories({
                treeReference: {
                    appNamespace: "@wix/stores"
                }
            })
                .eq('visible', true)
                .find();
            
            return categoriesResult.items || [];
        })
        .recover(error => {
            console.error('Failed to load categories:', error);
            return Pipeline.ok([]);
        })
        .toPhaseOutput(categories => {
            const categoryInfos: CategoryInfos = categories.map((cat) => ({
                categoryId: cat._id || '',
                categoryName: cat.name || '',
                categorySlug: cat.slug || ''
            }));

            return {
                viewState: {
                    searchFields: 'name,description,sku',
                    fuzzySearch: true,
                    emptyStateMessage: 'Enter a search term to find products',
                    filters: {
                        categoryFilter: {
                            categories: categoryInfos
                        }
                    }
                },
                carryForward: {
                    searchFields: 'name,description,sku',
                    fuzzySearch: true,
                    categories: categoryInfos
                }
            };
        });
}

/**
 * Fast Rendering Phase
 * Loads dynamic data per request:
 * - Initial products
 * - Search results
 * - Load more state
 */
async function renderFastChanging(
    props: PageProps,
    slowCarryForward: SearchSlowCarryForward,
    wixStores: WixStoresService
) {
    const Pipeline = RenderPipeline.for<ProductSearchFastViewState, SearchFastCarryForward>();

    return Pipeline
        .try(async () => {
            // Load initial products
            const productsResult = await wixStores.products.queryProducts({
                fields: ['CURRENCY']
            })
                .limit(PAGE_SIZE)
                .find();
            
            // Get total count - the Wix SDK returns items but not always total count
            const items = productsResult.items || [];
            const total = items.length; // Initial load, will be updated on search
            
            return { items, total };
        })
        .recover(error => {
            console.error('Failed to load products:', error);
            return Pipeline.ok({ items: [], total: 0 });
        })
        .toPhaseOutput(({ items, total }) => {
            const mappedProducts = items.map(p => mapProductToCard(p));

            return {
                viewState: {
                    searchExpression: '',
                    isSearching: false,
                    hasSearched: false,
                    searchResults: mappedProducts,
                    resultCount: items.length,
                    hasResults: items.length > 0,
                    hasSuggestions: false,
                    suggestions: [],
                    filters: {
                        inStockOnly: false,
                        priceRange: {
                            minPrice: 0,
                            maxPrice: 0
                        },
                        categoryFilter: {
                            categories: slowCarryForward.categories.map(cat => ({
                                categoryId: cat.categoryId,
                                isSelected: false
                            }))
                        }
                    },
                    sortBy: {
                        currentSort: CurrentSort.relevance
                    },
                    hasMore: items.length < total,
                    loadedCount: items.length,
                    totalCount: total
                },
                carryForward: {
                    searchFields: slowCarryForward.searchFields,
                    fuzzySearch: slowCarryForward.fuzzySearch,
                    categories: slowCarryForward.categories
                }
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
    props: Props<PageProps>,
    refs: ProductSearchRefs,
    viewStateSignals: Signals<ProductSearchFastViewState>,
    fastCarryForward: SearchFastCarryForward,
    storesContext: WixStoresContext
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
            case CurrentSort.priceAsc: return 'price_asc';
            case CurrentSort.priceDesc: return 'price_desc';
            case CurrentSort.newest: return 'newest';
            case CurrentSort.nameAsc: return 'name_asc';
            case CurrentSort.nameDesc: return 'name_desc';
            default: return 'relevance';
        }
    };

    // Perform search (replaces results, resets cursor)
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
                    categoryIds: currentFilters.categoryFilter.categories
                        .filter(c => c.isSelected)
                        .map(c => c.categoryId),
                    inStockOnly: currentFilters.inStockOnly
                },
                sortBy: mapSortToAction(currentSort),
                // No cursor = start from beginning
                pageSize: PAGE_SIZE
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

            const result = await searchProducts({
                query: searchTerm || '',
                filters: {
                    minPrice: currentFilters.priceRange.minPrice || undefined,
                    maxPrice: currentFilters.priceRange.maxPrice || undefined,
                    categoryIds: currentFilters.categoryFilter.categories
                        .filter(c => c.isSelected)
                        .map(c => c.categoryId),
                    inStockOnly: currentFilters.inStockOnly
                },
                sortBy: mapSortToAction(currentSort),
                cursor: currentCursor,
                pageSize: PAGE_SIZE
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

    // Price range filters
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

    // Category filter checkboxes
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

    // In stock only filter
    refs.filters.inStockOnly.oninput(({ event }) => {
        const isChecked = (event.target as HTMLInputElement).checked;
        setFilters(patch(filters(), [
            { op: REPLACE, path: ['inStockOnly'], value: isChecked }
        ]));
    });

    // Clear filters button
    refs.filters.clearFilters.onclick(() => {
        const currentFilters = filters();
        const clearedCategories = currentFilters.categoryFilter.categories.map(cat => ({
            ...cat,
            isSelected: false
        }));
        
        setFilters({
            priceRange: { minPrice: 0, maxPrice: 0 },
            categoryFilter: { categories: clearedCategories },
            inStockOnly: false
        });
    });

    // Load more button
    refs.loadMoreButton.onclick(() => {
        performLoadMore();
    });

    // Suggestion clicks
    refs.suggestions.suggestionButton.onclick(({ coordinate }) => {
        const [suggestionId] = coordinate;
        const suggestion = suggestions().find(s => s.suggestionId === suggestionId);
        if (suggestion) {
            setSearchExpression(suggestion.suggestionText);
            setSubmittedSearchTerm(suggestion.suggestionText);
        }
    });

    // Product card add to cart (SIMPLE products)
    refs.searchResults.addToCartButton.onclick(async ({ coordinate }) => {
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
            console.error('Failed to add to cart:', error);
        } finally {
            setSearchResults(patch(searchResults(), [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false }
            ]));
        }
    });

    // Quick option choice click (SINGLE_OPTION products)
    refs.searchResults.quickOption.choices.choiceButton.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;
        
        const currentResults = searchResults();
        const productIndex = currentResults.findIndex(p => p._id === productId);
        if (productIndex === -1) return;
        
        const product = currentResults[productIndex];
        const choice = product.quickOption?.choices?.find(c => c.choiceId === choiceId);
        
        if (!choice || !choice.inStock) {
            console.warn('Choice not available or out of stock');
            return;
        }

        setSearchResults(patch(currentResults, [
            { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true }
        ]));

        try {
            const optionId = product.quickOption._id;
            await storesContext.addToCart(productId, 1, {
                options: { [optionId]: choice.choiceId },
                modifiers: {},
                customTextFields: {}
            });
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setSearchResults(patch(searchResults(), [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false }
            ]));
        }
    });

    // View options button (NEEDS_CONFIGURATION products)
    refs.searchResults.viewOptionsButton.onclick(({ coordinate }) => {
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
    .withProps<PageProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withContexts(WIX_STORES_CONTEXT)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductSearchInteractive);
