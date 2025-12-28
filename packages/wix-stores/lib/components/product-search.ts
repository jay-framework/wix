import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals
} from '@jay-framework/fullstack-component';
import { createSignal, createMemo, createEffect, Props } from '@jay-framework/component';
import {
    CurrentSort,
    ProductSearchContract,
    ProductSearchFastViewState,
    ProductSearchInteractiveViewState,
    ProductSearchRefs,
    ProductSearchSlowViewState
} from '../contracts/product-search.jay-contract';
import {
    AvailabilityStatus,
    MediaType,
    PreorderStatus,
    ProductCardViewState,
    ProductType
} from '../contracts/product-card.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../stores-client/wix-stores-service';
import { patch, REPLACE } from '@jay-framework/json-patch';

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

function formatWixMediaUrl(_id: string, url: string, resize?: { w: number; h: number }): string {
    const resizeFragment = resize ?
        `/v1/fit/w_${resize.w},h_${resize.h},q_90/file.jpg` :
        ``;
    if (url)
        return url;
    else
        return `https://static.wixstatic.com/media/${_id}${resizeFragment}`;
}

function mapAvailabilityStatus(status: string | undefined): AvailabilityStatus {
    switch (status) {
        case 'OUT_OF_STOCK': return AvailabilityStatus.OUT_OF_STOCK;
        case 'PARTIALLY_OUT_OF_STOCK': return AvailabilityStatus.PARTIALLY_OUT_OF_STOCK;
        default: return AvailabilityStatus.IN_STOCK;
    }
}

function mapPreorderStatus(status: string | undefined): PreorderStatus {
    switch (status) {
        case 'ENABLED': return PreorderStatus.ENABLED;
        case 'PARTIALLY_ENABLED': return PreorderStatus.PARTIALLY_ENABLED;
        default: return PreorderStatus.DISABLED;
    }
}

function mapMediaType(mediaType: string | undefined): MediaType {
    return mediaType === 'VIDEO' ? MediaType.VIDEO : MediaType.IMAGE;
}

function mapProductType(productType: string | undefined): ProductType {
    return productType === 'DIGITAL' ? ProductType.DIGITAL : ProductType.PHYSICAL;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProductToCard(product: any): ProductCardViewState {
    const mainMedia = product.media?.main;
    const hasDiscount = product.compareAtPriceRange?.minValue?.amount !== product.actualPriceRange?.minValue?.amount;

    return {
        _id: product._id || '',
        name: product.name || '',
        slug: product.slug || '',
        mainMedia: {
            url: mainMedia ? formatWixMediaUrl(mainMedia._id, mainMedia.url) : '',
            altText: mainMedia?.altText || product.name || '',
            mediaType: mapMediaType(mainMedia?.mediaType)
        },
        thumbnail: {
            url: mainMedia ? formatWixMediaUrl(mainMedia._id, mainMedia.url, { w: 300, h: 300 }) : '',
            altText: mainMedia?.altText || product.name || '',
            width: 300,
            height: 300
        },
        actualPriceRange: {
            minValue: {
                amount: product.actualPriceRange?.minValue?.amount || '0',
                formattedAmount: product.actualPriceRange?.minValue?.formattedAmount || ''
            },
            maxValue: {
                amount: product.actualPriceRange?.maxValue?.amount || '0',
                formattedAmount: product.actualPriceRange?.maxValue?.formattedAmount || ''
            }
        },
        compareAtPriceRange: {
            minValue: {
                amount: product.compareAtPriceRange?.minValue?.amount || '0',
                formattedAmount: product.compareAtPriceRange?.minValue?.formattedAmount || ''
            },
            maxValue: {
                amount: product.compareAtPriceRange?.maxValue?.amount || '0',
                formattedAmount: product.compareAtPriceRange?.maxValue?.formattedAmount || ''
            }
        },
        currency: product.currency || 'USD',
        hasDiscount,
        inventory: {
            availabilityStatus: mapAvailabilityStatus(product.inventory?.availabilityStatus),
            preorderStatus: mapPreorderStatus(product.inventory?.preorderStatus)
        },
        ribbon: {
            _id: product.ribbon?._id || '',
            name: product.ribbon?.name || ''
        },
        hasRibbon: !!product.ribbon?.name,
        brand: {
            _id: product.brand?._id || '',
            name: product.brand?.name || ''
        },
        productType: mapProductType(product.productType),
        visible: product.visible !== false,
        isAddingToCart: false
    };
}

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
            
            console.log('Categories loaded:', categoriesResult.items);
            return categoriesResult.items || [];
        })
        .recover(error => {
            console.error('Failed to load categories:', error);
            return Pipeline.ok([]);
        })
        .toPhaseOutput(categories => {
            const categoryInfos: CategoryInfos = categories.map((cat) => ({
                categoryId: cat._id || '',
                categoryName: cat.name || ''
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
 * - Pagination state
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
            const productsResult = await wixStores.products.queryProducts()
                .limit(PAGE_SIZE)
                .find();
            
            return productsResult.items || [];
        })
        .recover(error => {
            console.error('Failed to load products:', error);
            return Pipeline.ok([]);
        })
        .toPhaseOutput(products => {
            const mappedProducts = products.map(mapProductToCard);
            const totalPages = Math.ceil(products.length / PAGE_SIZE) || 1;

            return {
                viewState: {
                    searchExpression: '',
                    isSearching: false,
                    hasSearched: false,
                    searchResults: mappedProducts,
                    resultCount: products.length,
                    hasResults: products.length > 0,
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
                    pagination: {
                        currentPage: 1,
                        totalPages,
                        hasNextPage: totalPages > 1,
                        hasPrevPage: false
                    }
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
 * - Pagination
 * - Search suggestions
 * 
 * All state updates use immutable patterns with the patch utility.
 * 
 * Search trigger pattern:
 * - `searchExpression` is for live input display (typing doesn't trigger search)
 * - `submittedSearchTerm` is updated only when search button is clicked
 * - The effect depends on `submittedSearchTerm`, `filters`, `sortBy`, `pagination`
 *   so it runs reactively when any of these change
 */
function ProductSearchInteractive(
    props: Props<PageProps>,
    refs: ProductSearchRefs,
    viewStateSignals: Signals<ProductSearchFastViewState>,
    fastCarryForward: SearchFastCarryForward
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
        pagination: [pagination, setPagination]
    } = viewStateSignals;

    // Submitted search term - only updated when search button is clicked
    // This separates "typing" from "searching"
    const [submittedSearchTerm, setSubmittedSearchTerm] = createSignal<string | null>(null);

    // Computed pagination values
    const totalPages = createMemo(() => Math.ceil(resultCount() / PAGE_SIZE) || 1);
    const hasNextPage = createMemo(() => pagination().currentPage < totalPages());
    const hasPrevPage = createMemo(() => pagination().currentPage > 1);

    let isFirst = true;
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    let searchVersion = 0; // Incremented on each search to handle race conditions
    const DEBOUNCE_MS = 300;

    // Perform the search - extracted so we can pass version for race condition handling
    const performSearch = async (
        version: number,
        searchTerm: string | null,
        currentFilters: ProductSearchFastViewState['filters'],
        currentSort: CurrentSort,
        currentPage: number
    ) => {
        setIsSearching(true);
        setHasSearched(true);

        try {
            // In the interactive phase, we log the search parameters
            // In a real implementation, this would call a server endpoint via fetch
            await new Promise(resolve => setTimeout(resolve, 300));

            // Check if a newer search was started - if so, ignore this result
            if (version !== searchVersion) {
                return;
            }

            console.log('Searching:', {
                searchExpression: searchTerm,
                searchFields: fastCarryForward.searchFields,
                fuzzySearch: fastCarryForward.fuzzySearch,
                sort: currentSort,
                page: currentPage,
                filters: {
                    minPrice: currentFilters.priceRange.minPrice,
                    maxPrice: currentFilters.priceRange.maxPrice,
                    categories: currentFilters.categoryFilter.categories
                        .filter(c => c.isSelected)
                        .map(c => c.categoryId),
                    inStockOnly: currentFilters.inStockOnly
                }
            });

            // TODO: Call search API and update searchResults
            // For now, we keep the current results

        } catch (error) {
            // Only log error if this is still the current search
            if (version === searchVersion) {
                console.error('Search failed:', error);
            }
        } finally {
            // Only update isSearching if this is still the current search
            if (version === searchVersion) {
                setIsSearching(false);
            }
        }
    };

    // Reactive search effect - runs when any search parameter changes
    // Depends on: submittedSearchTerm, filters, sortBy, pagination (all reactive)
    createEffect(() => {
        // Access all reactive dependencies
        const searchTerm = submittedSearchTerm();
        const currentFilters = filters();
        const currentSort = sortBy().currentSort;
        const currentPage = pagination().currentPage;

        // Skip the initial run
        if (isFirst) {
            isFirst = false;
            return;
        }

        // Clear any pending debounced search
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }

        // Debounce the search
        debounceTimeout = setTimeout(() => {
            // Increment version to invalidate any in-flight searches
            searchVersion++;
            const version = searchVersion;
            performSearch(version, searchTerm, currentFilters, currentSort, currentPage);
        }, DEBOUNCE_MS);
    });

    // Search input handler - only updates live input, does not trigger search
    refs.searchExpression.oninput(({ event }) => {
        const value = (event.target as HTMLInputElement).value;
        setSearchExpression(value);
    });

    // Search button click - submits the current search term, triggering the effect
    refs.searchButton.onclick(() => {
        setPagination(patch(pagination(), [
            { op: REPLACE, path: ['currentPage'], value: 1 }
        ]));
        setSubmittedSearchTerm(searchExpression().trim());
    });

    // Clear search button
    refs.clearSearchButton.onclick(() => {
        setSearchExpression('');
        setSubmittedSearchTerm(null);
        setHasSearched(false);
        setPagination(patch(pagination(), [
            { op: REPLACE, path: ['currentPage'], value: 1 }
        ]));
    });

    // Sorting dropdown - updates sort, effect runs automatically if search was submitted
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
        // Reset to page 1 when sort changes
        setPagination(patch(pagination(), [
            { op: REPLACE, path: ['currentPage'], value: 1 }
        ]));
        // Effect will run automatically since sortBy and pagination are dependencies
    });

    // Price range filters - update filters immutably
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

    // Category filter checkboxes - update categories immutably
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

    // Apply filters button - reset to page 1, effect runs automatically
    refs.filters.applyFilters.onclick(() => {
        setPagination(patch(pagination(), [
            { op: REPLACE, path: ['currentPage'], value: 1 }
        ]));
        // If user hasn't searched yet, submit the current search term
        if (submittedSearchTerm() === null) {
            setSubmittedSearchTerm(searchExpression().trim());
        }
        // Effect will run automatically since filters and pagination are dependencies
    });

    // Clear filters button - reset all filter values
    refs.filters.clearFilters.onclick(() => {
        const currentFilters = filters();
        // Reset all category selections
        const clearedCategories = currentFilters.categoryFilter.categories.map(cat => ({
            ...cat,
            isSelected: false
        }));
        
        setFilters({
            priceRange: { minPrice: 0, maxPrice: 0 },
            categoryFilter: { categories: clearedCategories },
            inStockOnly: false
        });
        
        setPagination(patch(pagination(), [
            { op: REPLACE, path: ['currentPage'], value: 1 }
        ]));
        // Effect will run automatically since filters and pagination are dependencies
    });

    // Pagination - previous page
    refs.pagination.prevButton.onclick(() => {
        const currentPage = pagination().currentPage;
        if (currentPage > 1) {
            setPagination(patch(pagination(), [
                { op: REPLACE, path: ['currentPage'], value: currentPage - 1 }
            ]));
            // Effect will run automatically since pagination is a dependency
        }
    });

    // Pagination - next page
    refs.pagination.nextButton.onclick(() => {
        const currentPage = pagination().currentPage;
        setPagination(patch(pagination(), [
            { op: REPLACE, path: ['currentPage'], value: currentPage + 1 }
        ]));
        // Effect will run automatically since pagination is a dependency
    });

    // Load more button (infinite scroll alternative)
    refs.pagination.loadMoreButton.onclick(() => {
        const currentPage = pagination().currentPage;
        setPagination(patch(pagination(), [
            { op: REPLACE, path: ['currentPage'], value: currentPage + 1 }
        ]));
        // Effect will run automatically since pagination is a dependency
    });

    // Suggestion clicks - set search term and submit
    refs.suggestions.suggestionButton.onclick(({ coordinate }) => {
        const [suggestionId] = coordinate;
        const suggestion = suggestions().find(s => s.suggestionId === suggestionId);
        if (suggestion) {
            setSearchExpression(suggestion.suggestionText);
            setPagination(patch(pagination(), [
                { op: REPLACE, path: ['currentPage'], value: 1 }
            ]));
            setSubmittedSearchTerm(suggestion.suggestionText);
            // Effect will run automatically since submittedSearchTerm is a dependency
        }
    });

    // Product card add to cart
    refs.searchResults.addToCartButton.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;
        console.log('Quick add to cart:', productId);
        // TODO: Implement cart functionality
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
            pagination: {
                currentPage: pagination().currentPage,
                totalPages: totalPages(),
                hasNextPage: hasNextPage(),
                hasPrevPage: hasPrevPage()
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
 * Rendering phases:
 * - Slow: Categories for filtering (relatively static)
 * - Fast: Products, search results, pagination (dynamic per request)
 * - Interactive: Search input, filter selections, sorting (client-side)
 * 
 * Usage:
 * ```typescript
 * import { productSearch } from '@jay-framework/wix-stores';
 * 
 * // Render the search component at /products route
 * ```
 */
export const productSearch = makeJayStackComponent<ProductSearchContract>()
    .withProps<PageProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductSearchInteractive);
