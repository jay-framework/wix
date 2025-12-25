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
 * Data carried forward from slow rendering to fast rendering
 */
interface SearchSlowCarryForward {
    searchFields: string;
    fuzzySearch: boolean;
    categoryIds: string[];
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface SearchFastCarryForward {
    searchFields: string;
    fuzzySearch: boolean;
    categoryIds: string[];
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
 * Loads semi-static search configuration:
 * - Search field configuration
 * - Fuzzy search settings
 * - Available categories for filtering
 * - Initial product results
 */
async function renderSlowlyChanging(
    props: PageProps,
    wixStores: WixStoresService
) {
    const Pipeline = RenderPipeline.for<ProductSearchSlowViewState, SearchSlowCarryForward>();

    return Pipeline
        .try(async () => {

            console.log('******************************')
            const collectionsResult = await wixStores.categories.queryCategories({
                treeReference: {
                    appNamespace: "@wix/stores"
                }
            })
                .eq('visible', true)
                .find()
            console.log('******************************')
            const productsResult = await wixStores.products.queryProducts().limit(PAGE_SIZE).find();
            console.log('******************************')
            // Load categories for filtering and initial products
            // const [collectionsResult, productsResult] = await Promise.all([
            //     wixStores.collections.queryCollections().find(),
            //     wixStores.products.queryProducts().limit(PAGE_SIZE).find()
            // ]);
            return {
                collections: collectionsResult.items || [],
                products: productsResult.items || []
            };
        })
        .recover(error => {
            console.error('Failed to load search page data:', error);
            return Pipeline.ok({ collections: [], products: [] });
        })
        .toPhaseOutput(({ collections, products }) => ({
            viewState: {
                searchFields: 'name,description,sku',
                fuzzySearch: true,
                isSearching: false,
                hasSearched: false,
                searchResults: products.map(mapProductToCard),
                resultCount: products.length,
                hasResults: products.length > 0,
                emptyStateMessage: 'Enter a search term to find products',
                hasSuggestions: false,
                filters: {
                    categoryFilter: {
                        categories: collections.map((cat) => ({
                            categoryId: cat._id || '',
                            categoryName: cat.name || ''
                        }))
                    }
                },
                sortBy: {
                    currentSort: CurrentSort.relevance
                },
                pagination: {
                    currentPage: 1,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPrevPage: false
                },
                suggestions: []
            },
            carryForward: {
                searchFields: 'name,description,sku',
                fuzzySearch: true,
                categoryIds: collections.map(c => c._id || '')
            }
        }));
}

/**
 * Fast Rendering Phase
 * Loads dynamic search state that may change per request
 */
async function renderFastChanging(
    props: PageProps,
    slowCarryForward: SearchSlowCarryForward,
    wixStores: WixStoresService
) {
    const Pipeline = RenderPipeline.for<ProductSearchFastViewState, SearchFastCarryForward>();

    return Pipeline
        .ok({
            searchExpression: '',
            filters: {
                inStockOnly: false,
                priceRange: {
                    minPrice: 0,
                    maxPrice: 0
                },
                categoryFilter: {
                    categories: slowCarryForward.categoryIds.map(id => ({
                        categoryId: id,
                        isSelected: false
                    }))
                }
            }
        })
        .toPhaseOutput(viewState => ({
            viewState,
            carryForward: {
                searchFields: slowCarryForward.searchFields,
                fuzzySearch: slowCarryForward.fuzzySearch,
                categoryIds: slowCarryForward.categoryIds
            }
        }));
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
        filters: [filters, setFilters]
    } = viewStateSignals;

    const [currentSort, setCurrentSort] = createSignal<CurrentSort>(CurrentSort.relevance);
    const [currentPage, setCurrentPage] = createSignal(1);
    const [isSearching, setIsSearching] = createSignal(false);
    const [hasSearched, setHasSearched] = createSignal(false);
    const [minPrice, setMinPrice] = createSignal<number>(0);
    const [maxPrice, setMaxPrice] = createSignal<number>(0);
    const [inStockOnly, setInStockOnly] = createSignal(false);
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
        // In a real implementation, we would look up the suggestion text
        setCurrentPage(1);
        performSearch();
    });

    // Product card add to cart
    refs.searchResults.addToCartButton.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;
        console.log('Quick add to cart:', productId);
        // TODO: Implement cart functionality
    });

    // Build the categories array for render
    const categoriesForRender = createMemo(() => {
        return fastCarryForward.categoryIds.map(id => ({
            categoryId: id,
            isSelected: selectedCategories().has(id)
        }));
    });

    return {
        render: (): ProductSearchInteractiveViewState => ({
            searchExpression: searchExpression(),
            filters: {
                inStockOnly: inStockOnly(),
                priceRange: {
                    minPrice: minPrice(),
                    maxPrice: maxPrice()
                },
                categoryFilter: {
                    categories: categoriesForRender()
                }
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
 * // Render the search component at /products route
 * ```
 */
export const productSearch = makeJayStackComponent<ProductSearchContract>()
    .withProps<PageProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductSearchInteractive);
