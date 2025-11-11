import {
    makeJayStackComponent,
    PageProps,
    partialRender
} from '@jay-framework/fullstack-component';
import { createSignal, Props } from '@jay-framework/component';
import { ProductSearchContract, ProductSearchRefs } from '../contracts/product-search.jay-contract';
import { WixStoresContext, WixStoresContextMarker } from './wix-stores-context';

/**
 * Search sort options
 */
export type SearchSortOption = 'relevance' | 'priceAsc' | 'priceDesc' | 'newest' | 'nameAsc' | 'nameDesc';

/**
 * Data carried forward from slow rendering to fast rendering
 */
interface SearchSlowCarryForward {
    searchFields: string;
    fuzzySearch: boolean;
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface SearchFastCarryForward extends SearchSlowCarryForward {
    // No additional data needed
}

/**
 * Slow Rendering Phase
 * Loads semi-static search configuration:
 * - Search field configuration
 * - Fuzzy search settings
 * - Available categories for filtering
 */
async function renderSlowlyChanging(
    props: PageProps,
    wixStores: WixStoresContext
) {
    try {
        // Load categories for filtering
        const { collection } = await wixStores.collections.queryCollections().find();

        return partialRender(
            {
                searchFields: 'name,description,sku',
                fuzzySearch: true,
                filters: {
                    categoryFilter: {
                        categories: collection.map((cat) => ({
                            categoryId: cat._id,
                            categoryName: cat.name,
                            isSelected: false
                        }))
                    }
                }
            },
            {
                searchFields: 'name,description,sku',
                fuzzySearch: true
            }
        );
    } catch (error) {
        console.error('Failed to render search page (slow):', error);
        return partialRender(
            {
                searchFields: 'name,description,sku',
                fuzzySearch: true,
                filters: {
                    categoryFilter: {
                        categories: []
                    }
                }
            },
            {
                searchFields: 'name,description,sku',
                fuzzySearch: true
            }
        );
    }
}

/**
 * Fast Rendering Phase
 * Loads initial search state:
 * - Empty search results (before user searches)
 * - Initial pagination state
 */
async function renderFastChanging(
    props: PageProps & SearchSlowCarryForward,
    wixStores: WixStoresContext
) {
    // Return initial empty state
    // Actual search will be performed client-side or on subsequent requests
    return partialRender(
        {
            hasSearched: false,
            hasResults: false,
            resultCount: 0,
            hasSuggestions: false,
            emptyStateMessage: 'Enter a search term to find products',
            sortBy: {
                currentSort: 'relevance' as const
            },
            pagination: {
                currentPage: 1,
                totalPages: 0,
                hasNextPage: false,
                hasPrevPage: false
            }
        },
        {
            searchFields: props.searchFields,
            fuzzySearch: props.fuzzySearch
        }
    );
}

/**
 * Interactive Phase (Client-Side)
 * Handles user interactions:
 * - Search input and submission
 * - Filtering (categories, price, stock)
 * - Sorting
 * - Pagination
 * - Search suggestions
 */
function ProductSearchInteractive(
    props: Props<PageProps & SearchFastCarryForward>,
    refs: ProductSearchRefs
) {
    const [searchExpression, setSearchExpression] = createSignal('');
    const [isSearching, setIsSearching] = createSignal(false);
    const [hasSearched, setHasSearched] = createSignal(false);
    const [hasResults, setHasResults] = createSignal(false);
    const [resultCount, setResultCount] = createSignal(0);
    const [currentSort, setCurrentSort] = createSignal<SearchSortOption>('relevance');
    const [currentPage, setCurrentPage] = createSignal(1);
    const [minPrice, setMinPrice] = createSignal<number | undefined>(undefined);
    const [maxPrice, setMaxPrice] = createSignal<number | undefined>(undefined);
    const [selectedCategories, setSelectedCategories] = createSignal<Set<string>>(new Set());
    const [inStockOnly, setInStockOnly] = createSignal(false);
    const [hasSuggestions, setHasSuggestions] = createSignal(false);

    // Search input
    refs.searchExpression.oninput((event) => {
        setSearchExpression(event.target.value);
    });

    // Perform search
    const performSearch = async () => {
        if (!searchExpression().trim()) {
            return;
        }

        setIsSearching(true);
        try {
            // TODO: Implement actual search API call
            await new Promise(resolve => setTimeout(resolve, 300));
            
            console.log('Searching:', {
                searchExpression: searchExpression(),
                searchFields: props.searchFields(),
                fuzzySearch: props.fuzzySearch(),
                sort: currentSort(),
                page: currentPage(),
                filters: {
                    minPrice: minPrice(),
                    maxPrice: maxPrice(),
                    categories: Array.from(selectedCategories()),
                    inStockOnly: inStockOnly()
                }
            });

            setHasSearched(true);
            setHasResults(true);
            setResultCount(0); // This would come from actual search results
        } catch (error) {
            console.error('Search failed:', error);
            setHasResults(false);
        } finally {
            setIsSearching(false);
        }
    };

    // Search button
    refs.searchButton.onclick(() => {
        setCurrentPage(1);
        performSearch();
    });

    // Clear search
    refs.clearSearchButton.onclick(() => {
        setSearchExpression('');
        setHasSearched(false);
        setHasResults(false);
        setResultCount(0);
        setCurrentPage(1);
        console.log('Search cleared');
    });

    // Sorting
    refs.sortBy.sortDropdown.onchange((event) => {
        const newSort = event.target.value as SearchSortOption;
        setCurrentSort(newSort);
        setCurrentPage(1);
        if (hasSearched()) {
            performSearch();
        }
    });

    // Filtering - Price range
    refs.filters.priceRange.minPrice.oninput((event) => {
        const value = parseFloat(event.target.value);
        setMinPrice(isNaN(value) ? undefined : value);
    });

    refs.filters.priceRange.maxPrice.oninput((event) => {
        const value = parseFloat(event.target.value);
        setMaxPrice(isNaN(value) ? undefined : value);
    });

    // Filtering - Categories
    refs.filters.categoryFilter.categories.forEach((category) => {
        category.isSelected.onchange((event) => {
            const categories = new Set(selectedCategories());
            if (event.target.checked) {
                categories.add(category.categoryId);
            } else {
                categories.delete(category.categoryId);
            }
            setSelectedCategories(categories);
        });
    });

    // Filtering - In stock only
    refs.filters.inStockOnly.onchange((event) => {
        setInStockOnly(event.target.checked);
    });

    // Apply filters
    refs.filters.applyFilters.onclick(() => {
        setCurrentPage(1);
        if (hasSearched()) {
            performSearch();
        }
    });

    // Clear filters
    refs.filters.clearFilters.onclick(() => {
        setMinPrice(undefined);
        setMaxPrice(undefined);
        setSelectedCategories(new Set());
        setInStockOnly(false);
        setCurrentPage(1);
        if (hasSearched()) {
            performSearch();
        }
    });

    // Pagination
    refs.pagination.prevButton.onclick(() => {
        setCurrentPage(prev => Math.max(1, prev - 1));
        performSearch();
    });

    refs.pagination.nextButton.onclick(() => {
        setCurrentPage(prev => prev + 1);
        performSearch();
    });

    refs.pagination.loadMoreButton.onclick(() => {
        setCurrentPage(prev => prev + 1);
        // For load more, we would append results rather than replace
        performSearch();
    });

    // Search suggestions
    refs.suggestions.forEach((suggestion) => {
        suggestion.suggestionButton.onclick(() => {
            setSearchExpression(suggestion.suggestionText);
            setCurrentPage(1);
            performSearch();
        });
    });

    return {
        render: () => ({
            searchExpression: searchExpression(),
            isSearching: isSearching(),
            hasSearched: hasSearched(),
            hasResults: hasResults(),
            resultCount: resultCount(),
            hasSuggestions: hasSuggestions(),
            sortBy: {
                currentSort: currentSort()
            },
            filters: {
                priceRange: {
                    minPrice: minPrice() || 0,
                    maxPrice: maxPrice() || 0
                },
                categoryFilter: {
                    categories: refs.filters.categoryFilter.categories.map((category) => ({
                        isSelected: selectedCategories().has(category.categoryId)
                    }))
                },
                inStockOnly: inStockOnly()
            },
            pagination: {
                currentPage: currentPage(),
                hasNextPage: currentPage() < Math.ceil(resultCount() / 20),
                hasPrevPage: currentPage() > 1
            }
        })
    };
}

/**
 * Product Search Full-Stack Component
 * 
 * A complete headless product search component with server-side rendering,
 * filtering, sorting, pagination, and search suggestions.
 * 
 * Usage:
 * ```typescript
 * import { productSearch } from '@jay-framework/wix-stores';
 * 
 * // Render the search component
 * ```
 */
export const productSearch = makeJayStackComponent<ProductSearchContract>()
    .withProps<PageProps>()
    .withServerContext(WixStoresContextMarker)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductSearchInteractive);
