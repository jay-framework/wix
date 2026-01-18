import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
    SlowlyRenderResult,
    UrlParams
} from '@jay-framework/fullstack-component';
import { createSignal, createEffect, Props } from '@jay-framework/component';
import {
    CategoryPageContract,
    CategoryPageFastViewState,
    CategoryPageRefs,
    CategoryPageSlowViewState,
    CurrentSort
} from '../contracts/category-page.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service';
import { WIX_STORES_CONTEXT, WixStoresContext } from '../contexts/wix-stores-context';
import { mapProductToCard } from '../utils/product-mapper';
import { patch, REPLACE } from '@jay-framework/json-patch';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';

/**
 * URL parameters for category page routes
 * Supports dynamic routing like /categories/[slug]
 */
export interface CategoryPageParams extends UrlParams {
    slug: string;
}

const PAGE_SIZE = 20;

/**
 * Data carried forward from slow rendering to fast rendering
 */
interface CategorySlowCarryForward {
    categoryId: string;
    categorySlug: string;
    totalProducts: number;
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface CategoryFastCarryForward {
    categoryId: string;
    categorySlug: string;
    totalProducts: number;
    pageSize: number;
}

/**
 * Breadcrumb item for navigation
 */
interface BreadcrumbItem {
    categoryId: string;
    categoryName: string;
    categorySlug: string;
}

/**
 * Load category slugs for static site generation
 * This function yields all category slugs to generate pages for.
 */
async function* loadCategoryParams(
    [wixStores]: [WixStoresService]
): AsyncIterable<CategoryPageParams[]> {
    try {
        const result = await wixStores.categories.queryCategories({
            treeReference: {
                appNamespace: "@wix/stores"
            }
        })
            .eq('visible', true)
            .find();

        yield (result.items || [])
            .filter(cat => cat.slug)
            .map((cat) => ({ slug: cat.slug! }));
    } catch (error) {
        console.error('Failed to load category slugs:', error);
        yield [];
    }
}

/**
 * Build breadcrumb trail from category parent chain
 */
async function buildBreadcrumbs(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    category: any,
    wixStores: WixStoresService
): Promise<BreadcrumbItem[]> {
    const breadcrumbs: BreadcrumbItem[] = [];
    
    // Start with parent if exists
    let parentId = category.parentCategory?._id;
    
    while (parentId) {
        try {
            // getCategory requires treeReference as second argument
            const parent = await wixStores.categories.getCategory(
                parentId,
                { appNamespace: "@wix/stores" }
            );
            if (parent) {
                breadcrumbs.unshift({
                    categoryId: parent._id || '',
                    categoryName: parent.name || '',
                    categorySlug: parent.slug || ''
                });
                parentId = parent.parentCategory?._id;
            } else {
                break;
            }
        } catch {
            break;
        }
    }
    
    // Add current category at the end
    breadcrumbs.push({
        categoryId: category._id || '',
        categoryName: category.name || '',
        categorySlug: category.slug || ''
    });
    
    return breadcrumbs;
}

/**
 * Map category media to view state format
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCategoryMedia(category: any): CategoryPageSlowViewState['media'] {
    const mainMedia = category.media?.mainMedia;
    const items = category.media?.items || [];
    
    return {
        mainMedia: mainMedia ? {
            _id: mainMedia._id || '',
            url: mainMedia.url || '',
            altText: mainMedia.altText || category.name || '',
            mediaType: mainMedia.mediaType || 'IMAGE'
        } : undefined,
        items: items.map((item: any) => ({
            _id: item._id || '',
            url: item.url || '',
            altText: item.altText || '',
            title: item.title || '',
            mediaType: item.mediaType || 'IMAGE',
            thumbnail: item.thumbnail ? {
                url: item.thumbnail.url || '',
                width: item.thumbnail.width || 0,
                height: item.thumbnail.height || 0,
                format: item.thumbnail.format || 'jpg'
            } : undefined
        }))
    };
}

/**
 * Slow Rendering Phase
 * Loads semi-static category data:
 * - Category details (name, description, slug)
 * - Media (images)
 * - Breadcrumb navigation
 * - Static metadata
 */
async function renderSlowlyChanging(
    props: PageProps & CategoryPageParams,
    wixStores: WixStoresService
): Promise<SlowlyRenderResult<CategoryPageSlowViewState, CategorySlowCarryForward>> {
    const Pipeline = RenderPipeline.for<CategoryPageSlowViewState, CategorySlowCarryForward>();

    // Do all async work in the try block, then return sync data for toPhaseOutput
    return Pipeline
        .try(async () => {
            // Query category by slug
            const result = await wixStores.categories.queryCategories({
                treeReference: {
                    appNamespace: "@wix/stores"
                }
            })
                .eq('slug', props.slug)
                .find();

            if (!result.items || result.items.length === 0) {
                // Throw to trigger recover()
                throw new Error('Category not found');
            }

            const category = result.items[0];
            
            // Build breadcrumbs from parent chain (async work done here)
            const breadcrumbs = await buildBreadcrumbs(category, wixStores);

            // Return all data needed for phase output
            return { category, breadcrumbs };
        })
        .recover(error => {
            console.error('Failed to load category:', error);
            return Pipeline.clientError(404, 'Category not found');
        })
        .toPhaseOutput((data) => {
            // This is now sync - all async work done above
            const { category, breadcrumbs } = data;
            return {
                viewState: {
                    _id: category._id || '',
                    name: category.name || '',
                    description: category.description || '',
                    slug: category.slug || '',
                    visible: category.visible !== false,
                    numberOfProducts: category.itemCounter || 0,
                    media: mapCategoryMedia(category),
                    breadcrumbs
                },
                carryForward: {
                    categoryId: category._id || '',
                    categorySlug: category.slug || '',
                    totalProducts: category.itemCounter || 0
                }
            };
        });
}

/**
 * Fast Rendering Phase
 * Loads dynamic data:
 * - Products in category
 * - Pagination metadata
 * - Initial sorting/filtering state
 */
async function renderFastChanging(
    props: PageProps & CategoryPageParams,
    slowCarryForward: CategorySlowCarryForward,
    wixStores: WixStoresService
) {
    const Pipeline = RenderPipeline.for<CategoryPageFastViewState, CategoryFastCarryForward>();

    return Pipeline
        .try(async () => {
            // List items in category with arrangement
            const itemsResult = await wixStores.categories.listItemsInCategory(
                slowCarryForward.categoryId,
                { appNamespace: "@wix/stores" },
                {
                    useCategoryArrangement: true,
                    cursorPaging: { limit: PAGE_SIZE }
                }
            );

            const items = itemsResult.items || [];
            const totalProducts = itemsResult.pagingMetadata?.total || items.length;

            // Fetch full product details for each item
            // getProduct returns the product directly (not wrapped in { product })
            const productCards: ProductCardViewState[] = [];
            for (const item of items) {
                if (item.catalogItemId) {
                    try {
                        const product = await wixStores.products.getProduct(
                            item.catalogItemId,
                            { fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'] }
                        );
                        if (product) {
                            productCards.push(mapProductToCard(product, '/products'));
                        }
                    } catch (err) {
                        console.error('Failed to load product:', item.catalogItemId, err);
                    }
                }
            }

            return { productCards, totalProducts };
        })
        .recover(error => {
            console.error('Failed to load category products:', error);
            return Pipeline.ok({ productCards: [], totalProducts: 0 });
        })
        .toPhaseOutput(({ productCards, totalProducts }) => {
            const totalPages = Math.ceil(totalProducts / PAGE_SIZE) || 1;

            return {
                viewState: {
                    products: productCards,
                    isLoading: false,
                    hasProducts: productCards.length > 0,
                    pagination: {
                        currentPage: 1,
                        totalPages,
                        totalProducts,
                        pageNumbers: Array.from(
                            { length: Math.min(totalPages, 10) },
                            (_, i) => ({
                                pageNumber: i + 1,
                                isCurrent: i === 0
                            })
                        )
                    },
                    sortBy: {
                        currentSort: CurrentSort.newest
                    },
                    filters: {
                        priceRange: {
                            minPrice: 0,
                            maxPrice: 0
                        },
                        inStockOnly: false
                    }
                },
                carryForward: {
                    categoryId: slowCarryForward.categoryId,
                    categorySlug: slowCarryForward.categorySlug,
                    totalProducts,
                    pageSize: PAGE_SIZE
                }
            };
        });
}

/**
 * Map CurrentSort enum to string for API calls
 */
function sortEnumToString(sort: CurrentSort): string {
    switch (sort) {
        case CurrentSort.newest: return 'newest';
        case CurrentSort.priceAsc: return 'priceAsc';
        case CurrentSort.priceDesc: return 'priceDesc';
        case CurrentSort.nameAsc: return 'nameAsc';
        case CurrentSort.nameDesc: return 'nameDesc';
        default: return 'newest';
    }
}

/**
 * Interactive Phase (Client-Side)
 * Handles user interactions:
 * - Pagination navigation
 * - Sorting changes
 * - Filtering (price range, stock status)
 * - Add to cart on product cards
 */
function CategoryPageInteractive(
    props: Props<PageProps & CategoryPageParams>,
    refs: CategoryPageRefs,
    viewStateSignals: Signals<CategoryPageFastViewState>,
    fastCarryForward: CategoryFastCarryForward,
    storesContext: WixStoresContext
) {
    const {
        products: [products, setProducts],
        isLoading: [isLoading, setIsLoading],
        hasProducts: [hasProducts, setHasProducts],
        pagination: [pagination, setPagination],
        sortBy: [sortBy, setSortBy],
        filters: [filters, setFilters]
    } = viewStateSignals;

    const { categoryId, pageSize } = fastCarryForward;

    // Track if we need to reload products
    let isFirst = true;
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 300;

    /**
     * Reload products from server with current pagination/sorting
     */
    const reloadProducts = async (page: number, sort: CurrentSort) => {
        setIsLoading(true);

        try {
            // Call server action to fetch products
            // Convert enum to string for the context method
            const response = await storesContext.loadCategoryProducts(
                categoryId,
                page,
                pageSize,
                sortEnumToString(sort)
            );

            setProducts(response.products);
            setHasProducts(response.products.length > 0);
            setPagination(patch(pagination(), [
                { op: REPLACE, path: ['currentPage'], value: page },
                { op: REPLACE, path: ['totalPages'], value: response.totalPages },
                { op: REPLACE, path: ['totalProducts'], value: response.totalProducts },
                { op: REPLACE, path: ['pageNumbers'], value: Array.from(
                    { length: Math.min(response.totalPages, 10) },
                    (_, i) => ({
                        pageNumber: i + 1,
                        isCurrent: i + 1 === page
                    })
                )}
            ]));
        } catch (error) {
            console.error('Failed to reload products:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Reactive effect for pagination/sorting changes
    createEffect(() => {
        const currentPage = pagination().currentPage;
        const currentSort = sortBy().currentSort;

        if (isFirst) {
            isFirst = false;
            return;
        }

        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }

        debounceTimeout = setTimeout(() => {
            reloadProducts(currentPage, currentSort);
        }, DEBOUNCE_MS);
    });

    // Sorting dropdown
    refs.sortBy.sortDropdown.oninput(({ event }) => {
        const value = (event.target as HTMLSelectElement).value;
        const sortMap: Record<string, CurrentSort> = {
            'newest': CurrentSort.newest,
            'priceAsc': CurrentSort.priceAsc,
            'priceDesc': CurrentSort.priceDesc,
            'nameAsc': CurrentSort.nameAsc,
            'nameDesc': CurrentSort.nameDesc
        };
        const newSort = sortMap[value] ?? CurrentSort.newest;
        setSortBy({ currentSort: newSort });
        // Reset to page 1 when sort changes
        setPagination(patch(pagination(), [
            { op: REPLACE, path: ['currentPage'], value: 1 }
        ]));
    });

    // Pagination - Previous
    refs.pagination.prevButton.onclick(() => {
        const current = pagination().currentPage;
        if (current > 1) {
            setPagination(patch(pagination(), [
                { op: REPLACE, path: ['currentPage'], value: current - 1 }
            ]));
        }
    });

    // Pagination - Next
    refs.pagination.nextButton.onclick(() => {
        const current = pagination().currentPage;
        const total = pagination().totalPages;
        if (current < total) {
            setPagination(patch(pagination(), [
                { op: REPLACE, path: ['currentPage'], value: current + 1 }
            ]));
        }
    });

    // Pagination - Page number buttons
    refs.pagination.pageNumbers.pageButton.onclick(({ coordinate }) => {
        const [pageNumber] = coordinate;
        const targetPage = typeof pageNumber === 'number' ? pageNumber : parseInt(pageNumber as string, 10);
        setPagination(patch(pagination(), [
            { op: REPLACE, path: ['currentPage'], value: targetPage }
        ]));
    });

    // Filters - Price range
    refs.filters.priceRange.minPrice.oninput(({ event }) => {
        const value = parseFloat((event.target as HTMLInputElement).value);
        setFilters(patch(filters(), [
            { op: REPLACE, path: ['priceRange', 'minPrice'], value: isNaN(value) ? 0 : value }
        ]));
    });

    refs.filters.priceRange.maxPrice.oninput(({ event }) => {
        const value = parseFloat((event.target as HTMLInputElement).value);
        setFilters(patch(filters(), [
            { op: REPLACE, path: ['priceRange', 'maxPrice'], value: isNaN(value) ? 0 : value }
        ]));
    });

    refs.filters.priceRange.applyPriceFilter.onclick(() => {
        setPagination(patch(pagination(), [
            { op: REPLACE, path: ['currentPage'], value: 1 }
        ]));
    });

    // Filters - In stock only
    refs.filters.inStockOnly.oninput(({ event }) => {
        const checked = (event.target as HTMLInputElement).checked;
        setFilters(patch(filters(), [
            { op: REPLACE, path: ['inStockOnly'], value: checked }
        ]));
    });

    // Filters - Clear all
    refs.filters.clearFilters.onclick(() => {
        setFilters({
            priceRange: { minPrice: 0, maxPrice: 0 },
            inStockOnly: false
        });
        setPagination(patch(pagination(), [
            { op: REPLACE, path: ['currentPage'], value: 1 }
        ]));
    });

    // Product card - Add to cart (SIMPLE products)
    refs.products.addToCartButton.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;

        const currentProducts = products();
        const productIndex = currentProducts.findIndex(p => p._id === productId);
        if (productIndex === -1) return;

        // Set loading state
        setProducts(patch(currentProducts, [
            { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true }
        ]));

        try {
            await storesContext.addToCart(productId, 1);
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setProducts(patch(products(), [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false }
            ]));
        }
    });

    // Product card - Quick option choice (SINGLE_OPTION products)
    refs.products.quickOption.choices.choiceButton.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;

        const currentProducts = products();
        const productIndex = currentProducts.findIndex(p => p._id === productId);
        if (productIndex === -1) return;

        const product = currentProducts[productIndex];
        const choice = product.quickOption?.choices?.find(c => c.choiceId === choiceId);

        if (!choice || !choice.inStock) {
            console.warn('Choice not available or out of stock');
            return;
        }

        setProducts(patch(currentProducts, [
            { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true }
        ]));

        try {
            const optionId = product.quickOption!._id;
            await storesContext.addToCart(productId, 1, {
                options: { [optionId]: choice.choiceId },
                modifiers: {},
                customTextFields: {}
            });
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setProducts(patch(products(), [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false }
            ]));
        }
    });

    // Product card - View options button (NEEDS_CONFIGURATION products)
    refs.products.viewOptionsButton.onclick(({ coordinate }) => {
        const [productId] = coordinate;
        const product = products().find(p => p._id === productId);
        if (product?.productUrl) {
            window.location.href = product.productUrl;
        }
    });

    return {
        render: () => ({
            products: products(),
            isLoading: isLoading(),
            hasProducts: hasProducts(),
            pagination: pagination(),
            sortBy: sortBy(),
            filters: filters()
        })
    };
}

/**
 * Category Page Full-Stack Component
 * 
 * A complete headless category/collection page component with server-side rendering,
 * product listings, filtering, sorting, and pagination.
 * 
 * Rendering phases:
 * - Slow: Category metadata, breadcrumbs (static)
 * - Fast: Products, pagination (dynamic per request)
 * - Interactive: Sort/filter/pagination controls (client-side)
 * 
 * Usage:
 * ```typescript
 * import { categoryPage } from '@jay-framework/wix-stores';
 * 
 * // The component will automatically load categories and render pages
 * ```
 */
export const categoryPage = makeJayStackComponent<CategoryPageContract>()
    .withProps<PageProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withContexts(WIX_STORES_CONTEXT)
    .withLoadParams(loadCategoryParams)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(CategoryPageInteractive);
