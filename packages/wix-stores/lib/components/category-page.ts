import {
    makeJayStackComponent,
    PageProps,
    partialRender,
    UrlParams,
    notFound
} from '@jay-framework/fullstack-component';
import { createSignal, Props } from '@jay-framework/component';
import { CategoryPageContract, CategoryPageRefs } from '../contracts/category-page.jay-contract';
import { WixStoresContext, WixStoresContextMarker } from './wix-stores-context';
import {WIX_STORES_SERVICE_MARKER} from "../stores-client/wix-stores-context";

/**
 * URL parameters for category page routes
 * Supports dynamic routing like /categories/[slug]
 */
export interface CategoryPageParams extends UrlParams {
    slug: string;
}

/**
 * Sort options for products in the category
 */
export type SortOption = 'newest' | 'priceAsc' | 'priceDesc' | 'nameAsc' | 'nameDesc';

/**
 * Data carried forward from slow rendering to fast rendering
 */
interface CategorySlowCarryForward {
    categoryId: string;
    slug: string;
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface CategoryFastCarryForward extends CategorySlowCarryForward {
    totalProducts: number;
}

/**
 * Load category slugs for static site generation
 */
async function* loadCategoryParams(
    wixStores: WixStoresContext
): AsyncIterable<CategoryPageParams[]> {
    try {
        const { collection } = await wixStores.collections.queryCollections().find();
        yield collection.map((category) => ({ slug: category.slug }));
    } catch (error) {
        console.error('Failed to load category slugs:', error);
        yield [];
    }
}

/**
 * Slow Rendering Phase
 * Loads semi-static category data:
 * - Category details (name, description)
 * - Media (images, videos)
 * - Breadcrumb navigation
 * - Static metadata
 */
async function renderSlowlyChanging(
    props: PageProps & CategoryPageParams,
    wixStores: WixStoresContext
) {
    try {
        // Query category by slug
        const { collection } = await wixStores.collections
            .queryCollections()
            .eq('slug', props.slug)
            .find();

        if (!collection || collection.length === 0) {
            return notFound();
        }

        const category = collection[0];

        return partialRender(
            {
                _id: category._id || '',
                name: category.name || '',
                description: category.description || '',
                slug: category.slug || '',
                visible: category.visible !== false,
                media: {
                    mainMedia: category.media?.mainMedia ? {
                        _id: category.media.mainMedia.id || '',
                        url: category.media.mainMedia.url || '',
                        altText: category.media.mainMedia.altText || category.name || '',
                        mediaType: category.media.mainMedia.mediaType || 'IMAGE'
                    } : undefined,
                    items: category.media?.items?.map((item) => ({
                        _id: item.id || '',
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
                    })) || []
                },
                breadcrumbs: [] // TODO: Implement breadcrumb navigation
            },
            {
                categoryId: category._id || '',
                slug: category.slug || ''
            }
        );
    } catch (error) {
        console.error('Failed to render category page (slow):', error);
        return notFound();
    }
}

/**
 * Fast Rendering Phase
 * Loads dynamic data:
 * - Product count
 * - Initial product list
 * - Pagination metadata
 */
async function renderFastChanging(
    props: PageProps & CategoryPageParams & CategorySlowCarryForward,
    wixStores: WixStoresContext
) {
    try {
        // Query products in this category
        const response = await wixStores.products
            .queryProducts()
            .hasSome('collectionIds', [props.categoryId])
            .limit(20)
            .find();

        const totalProducts = response.totalCount || 0;
        const totalPages = Math.ceil(totalProducts / 20);

        return partialRender(
            {
                numberOfProducts: totalProducts,
                pagination: {
                    currentPage: 1,
                    totalPages,
                    totalProducts,
                    pageNumbers: Array.from({ length: Math.min(totalPages, 10) }, (_, i) => ({
                        pageNumber: i + 1,
                        isCurrent: i === 0
                    }))
                },
                sortBy: {
                    currentSort: 'newest' as const
                },
                hasProducts: totalProducts > 0
            },
            {
                categoryId: props.categoryId,
                slug: props.slug,
                totalProducts
            }
        );
    } catch (error) {
        console.error('Failed to render category page (fast):', error);
        return partialRender(
            {
                numberOfProducts: 0,
                pagination: {
                    currentPage: 1,
                    totalPages: 0,
                    totalProducts: 0,
                    pageNumbers: []
                },
                sortBy: {
                    currentSort: 'newest' as const
                },
                hasProducts: false
            },
            {
                categoryId: props.categoryId,
                slug: props.slug,
                totalProducts: 0
            }
        );
    }
}

/**
 * Interactive Phase (Client-Side)
 * Handles user interactions:
 * - Pagination navigation
 * - Sorting changes
 * - Filtering (price range, stock status)
 */
function CategoryPageInteractive(
    props: Props<PageProps & CategoryPageParams & CategoryFastCarryForward>,
    refs: CategoryPageRefs
) {
    const [isLoading, setIsLoading] = createSignal(false);
    const [currentPage, setCurrentPage] = createSignal(1);
    const [currentSort, setCurrentSort] = createSignal<SortOption>('newest');
    const [minPrice, setMinPrice] = createSignal<number | undefined>(undefined);
    const [maxPrice, setMaxPrice] = createSignal<number | undefined>(undefined);
    const [inStockOnly, setInStockOnly] = createSignal(false);

    // Breadcrumb navigation
    refs.breadcrumbs.forEach((breadcrumb) => {
        breadcrumb.categoryLink.onclick(() => {
            console.log('Navigating to category:', breadcrumb.categorySlug);
        });
    });

    // Sorting
    refs.sortBy.sortDropdown.onchange((event) => {
        const newSort = event.target.value as SortOption;
        setCurrentSort(newSort);
        setCurrentPage(1);
        console.log('Sort changed:', newSort);
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

    refs.filters.priceRange.applyPriceFilter.onclick(() => {
        setCurrentPage(1);
        console.log('Applying price filter:', { min: minPrice(), max: maxPrice() });
    });

    // Filtering - In stock only
    refs.filters.inStockOnly.onchange((event) => {
        setInStockOnly(event.target.checked);
        setCurrentPage(1);
        console.log('In stock filter:', event.target.checked);
    });

    // Clear filters
    refs.filters.clearFilters.onclick(() => {
        setMinPrice(undefined);
        setMaxPrice(undefined);
        setInStockOnly(false);
        setCurrentPage(1);
        console.log('Filters cleared');
    });

    // Pagination - Previous/Next
    refs.pagination.prevButton.onclick(() => {
        setCurrentPage(prev => Math.max(1, prev - 1));
        console.log('Previous page:', currentPage());
    });

    refs.pagination.nextButton.onclick(() => {
        setCurrentPage(prev => prev + 1);
        console.log('Next page:', currentPage());
    });

    // Pagination - Page numbers
    refs.pagination.pageNumbers.forEach((pageNum) => {
        pageNum.pageButton.onclick(() => {
            setCurrentPage(pageNum.pageNumber);
            console.log('Navigate to page:', pageNum.pageNumber);
        });
    });

    return {
        render: () => ({
            isLoading: isLoading(),
            hasProducts: props.totalProducts() > 0,
            sortBy: {
                currentSort: currentSort()
            },
            filters: {
                priceRange: {
                    minPrice: minPrice() || 0,
                    maxPrice: maxPrice() || 0
                },
                inStockOnly: inStockOnly()
            },
            pagination: {
                currentPage: currentPage(),
                pageNumbers: refs.pagination.pageNumbers.map((pageNum) => ({
                    isCurrent: pageNum.pageNumber === currentPage()
                }))
            }
        })
    };
}

/**
 * Category Page Full-Stack Component
 * 
 * A complete headless category/collection page component with server-side rendering,
 * product listings, filtering, sorting, and pagination.
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
    .withLoadParams(loadCategoryParams)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(CategoryPageInteractive);
