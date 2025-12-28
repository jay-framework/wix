import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals
} from '@jay-framework/fullstack-component';
import { createSignal, createMemo, Props } from '@jay-framework/component';
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

    const [currentSort, setCurrentSort] = createSignal<CurrentSort>(sortBy().currentSort);
    const [currentPage, setCurrentPage] = createSignal(pagination().currentPage);
    const [minPrice, setMinPrice] = createSignal<number>(filters().priceRange.minPrice);
    const [maxPrice, setMaxPrice] = createSignal<number>(filters().priceRange.maxPrice);
    const [inStockOnly, setInStockOnly] = createSignal(filters().inStockOnly);
    const [selectedCategories, setSelectedCategories] = createSignal<Set<string>>(new Set());

    // Perform search function - will be called from various interactions
    const performSearch = async () => {
        const searchTerm = searchExpression().trim();

        setIsSearching(true);
        setHasSearched(true);

        try {
            // In the interactive phase, we log the search parameters
            // In a real implementation, this would call a server endpoint via fetch
            await new Promise(resolve => setTimeout(resolve, 300));

            console.log('Searching:', {
                searchExpression: searchTerm,
                searchFields: fastCarryForward.searchFields,
                fuzzySearch: fastCarryForward.fuzzySearch,
                sort: currentSort(),
                page: currentPage(),
                filters: {
                    minPrice: minPrice(),
                    maxPrice: maxPrice(),
                    categories: Array.from(selectedCategories()),
                    inStockOnly: inStockOnly()
                }
            });

            // TODO: Call search API and update searchResults
            // For now, we keep the current results

        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setIsSearching(false);
        }
    };

    // Search input handler
    refs.searchExpression.oninput(({ event }) => {
        const value = (event.target as HTMLInputElement).value;
        setSearchExpression(value);
    });

    // Search button click
    refs.searchButton.onclick(() => {
        setCurrentPage(1);
        performSearch();
    });

    // Clear search button
    refs.clearSearchButton.onclick(() => {
        setSearchExpression('');
        setHasSearched(false);
        setCurrentPage(1);
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
        setCurrentSort(newSort);
        setSortBy({ currentSort: newSort });
        setCurrentPage(1);
        if (hasSearched()) {
            performSearch();
        }
    });

    // Price range filters
    refs.filters.priceRange.minPrice.oninput(({ event }) => {
        const value = parseFloat((event.target as HTMLInputElement).value);
        setMinPrice(isNaN(value) ? 0 : value);
    });

    refs.filters.priceRange.maxPrice.oninput(({ event }) => {
        const value = parseFloat((event.target as HTMLInputElement).value);
        setMaxPrice(isNaN(value) ? 0 : value);
    });

    // Category filter checkboxes
    refs.filters.categoryFilter.categories.isSelected.oninput(({ event, coordinate }) => {
        const [categoryId] = coordinate;
        const categories = new Set(selectedCategories());
        if ((event.target as HTMLInputElement).checked) {
            categories.add(categoryId);
        } else {
            categories.delete(categoryId);
        }
        setSelectedCategories(categories);
    });

    // In stock only filter
    refs.filters.inStockOnly.oninput(({ event }) => {
        setInStockOnly((event.target as HTMLInputElement).checked);
    });

    // Apply filters button
    refs.filters.applyFilters.onclick(() => {
        setCurrentPage(1);
        performSearch();
    });

    // Clear filters button
    refs.filters.clearFilters.onclick(() => {
        setMinPrice(0);
        setMaxPrice(0);
        setSelectedCategories(new Set());
        setInStockOnly(false);
        setCurrentPage(1);
        if (hasSearched()) {
            performSearch();
        }
    });

    // Pagination - previous page
    refs.pagination.prevButton.onclick(() => {
        if (currentPage() > 1) {
            setCurrentPage(prev => prev - 1);
            performSearch();
        }
    });

    // Pagination - next page
    refs.pagination.nextButton.onclick(() => {
        setCurrentPage(prev => prev + 1);
        performSearch();
    });

    // Load more button (infinite scroll alternative)
    refs.pagination.loadMoreButton.onclick(() => {
        setCurrentPage(prev => prev + 1);
        performSearch();
    });

    // Suggestion clicks
    refs.suggestions.suggestionButton.onclick(({ coordinate }) => {
        const [suggestionId] = coordinate;
        const suggestion = suggestions().find(s => s.suggestionId === suggestionId);
        if (suggestion) {
            setSearchExpression(suggestion.suggestionText);
            setCurrentPage(1);
            performSearch();
        }
    });

    // Product card add to cart
    refs.searchResults.addToCartButton.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;
        console.log('Quick add to cart:', productId);
        // TODO: Implement cart functionality
    });

    // Build the categories array for render
    const categoriesForRender = createMemo(() => {
        return fastCarryForward.categories.map(cat => ({
            categoryId: cat.categoryId,
            isSelected: selectedCategories().has(cat.categoryId)
        }));
    });

    // Computed pagination values
    const totalPages = createMemo(() => Math.ceil(resultCount() / PAGE_SIZE) || 1);
    const hasNextPage = createMemo(() => currentPage() < totalPages());
    const hasPrevPage = createMemo(() => currentPage() > 1);

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
            filters: {
                inStockOnly: inStockOnly(),
                priceRange: {
                    minPrice: minPrice(),
                    maxPrice: maxPrice()
                },
                categoryFilter: {
                    categories: categoriesForRender()
                }
            },
            sortBy: {
                currentSort: currentSort()
            },
            pagination: {
                currentPage: currentPage(),
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
