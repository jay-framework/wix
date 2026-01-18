import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
    SlowlyRenderResult,
    UrlParams
} from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import {
    CategoryPageContract,
    CategoryPageFastViewState,
    CategoryPageRefs,
    CategoryPageSlowViewState
} from '../contracts/category-page.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service';
import { WIX_STORES_CONTEXT, WixStoresContext } from '../contexts/wix-stores-context';
import { mapProductToCard } from '../utils/product-mapper';
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
    products: ProductCardViewState[];
    nextCursor: string | null;
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface CategoryFastCarryForward {
    categoryId: string;
    totalProducts: number;
    nextCursor: string | null;
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * Load products in parallel for a category
 */
async function loadCategoryProducts(
    categoryId: string,
    wixStores: WixStoresService,
    cursor?: string
): Promise<{ products: ProductCardViewState[]; nextCursor: string | null; total: number }> {
    // List items in category
    const itemsResult = await wixStores.categories.listItemsInCategory(
        categoryId,
        { appNamespace: "@wix/stores" },
        {
            useCategoryArrangement: true,
            cursorPaging: cursor 
                ? { limit: PAGE_SIZE, cursor } 
                : { limit: PAGE_SIZE }
        }
    );

    const items = itemsResult.items || [];
    const nextCursor = itemsResult.pagingMetadata?.cursors?.next || null;
    const total = itemsResult.pagingMetadata?.total || items.length;

    // Fetch full product details in parallel
    const productPromises = items
        .filter(item => item.catalogItemId)
        .map(async (item) => {
            try {
                const product = await wixStores.products.getProduct(
                    item.catalogItemId!,
                    { fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'] }
                );
                if (product) {
                    return mapProductToCard(product, '/products');
                }
            } catch (err) {
                console.error('Failed to load product:', item.catalogItemId, err);
            }
            return null;
        });

    const products = (await Promise.all(productPromises)).filter(Boolean) as ProductCardViewState[];

    return { products, nextCursor, total };
}

/**
 * Slow Rendering Phase
 * Loads category metadata and products in parallel.
 * Products are loaded here (slow phase) so they're available at build time.
 */
async function renderSlowlyChanging(
    props: PageProps & CategoryPageParams,
    wixStores: WixStoresService
): Promise<SlowlyRenderResult<CategoryPageSlowViewState, CategorySlowCarryForward>> {
    const Pipeline = RenderPipeline.for<CategoryPageSlowViewState, CategorySlowCarryForward>();

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
                throw new Error('Category not found');
            }

            const category = result.items[0];
            
            // Load breadcrumbs and products in parallel
            const [breadcrumbs, productData] = await Promise.all([
                buildBreadcrumbs(category, wixStores),
                loadCategoryProducts(category._id!, wixStores)
            ]);

            return { category, breadcrumbs, productData };
        })
        .recover(error => {
            console.error('Failed to load category:', error);
            return Pipeline.clientError(404, 'Category not found');
        })
        .toPhaseOutput((data) => {
            const { category, breadcrumbs, productData } = data;
            return {
                viewState: {
                    _id: category._id || '',
                    name: category.name || '',
                    description: category.description || '',
                    slug: category.slug || '',
                    visible: category.visible !== false,
                    numberOfProducts: category.itemCounter || 0,
                    media: mapCategoryMedia(category),
                    breadcrumbs,
                    products: productData.products
                },
                carryForward: {
                    categoryId: category._id || '',
                    categorySlug: category.slug || '',
                    totalProducts: productData.total,
                    products: productData.products,
                    nextCursor: productData.nextCursor
                }
            };
        });
}

/**
 * Fast Rendering Phase
 * Sets up initial "load more" state based on slow carry forward.
 * Products are already loaded in slow phase.
 */
async function renderFastChanging(
    props: PageProps & CategoryPageParams,
    slowCarryForward: CategorySlowCarryForward,
    _wixStores: WixStoresService
) {
    const Pipeline = RenderPipeline.for<CategoryPageFastViewState, CategoryFastCarryForward>();

    return Pipeline
        .ok(slowCarryForward)
        .toPhaseOutput((data) => {
            return {
                viewState: {
                    loadedProducts: [],
                    hasMore: data.nextCursor !== null,
                    loadedCount: data.products.length,
                    isLoading: false,
                    hasProducts: data.products.length > 0
                },
                carryForward: {
                    categoryId: data.categoryId,
                    totalProducts: data.totalProducts,
                    nextCursor: data.nextCursor
                }
            };
        });
}

/**
 * Interactive Phase (Client-Side)
 * Handles the "Load More" button to append additional products.
 */
function CategoryPageInteractive(
    _props: Props<PageProps & CategoryPageParams>,
    refs: CategoryPageRefs,
    viewStateSignals: Signals<CategoryPageFastViewState>,
    fastCarryForward: CategoryFastCarryForward,
    storesContext: WixStoresContext
) {
    const {
        loadedProducts: [loadedProducts, setLoadedProducts],
        hasMore: [hasMore, setHasMore],
        loadedCount: [loadedCount, setLoadedCount],
        isLoading: [isLoading, setIsLoading],
        hasProducts: [hasProducts, setHasProducts]
    } = viewStateSignals;

    const { categoryId } = fastCarryForward;
    
    // Track cursor for cursor-based pagination
    let currentCursor = fastCarryForward.nextCursor;

    // Load More button handler
    refs.loadMoreButton.onclick(async () => {
        if (!currentCursor || isLoading()) return;

        setIsLoading(true);

        try {
            // Load next batch of products using cursor
            const response = await storesContext.loadMoreCategoryProducts(
                categoryId,
                currentCursor,
                PAGE_SIZE
            );

            // Append new products to loadedProducts (separate from SSR products)
            const currentLoaded = loadedProducts();
            setLoadedProducts([...currentLoaded, ...response.products]);
            
            // Update metadata
            setLoadedCount(loadedCount() + response.products.length);
            setHasMore(response.nextCursor !== null);
            setHasProducts(true);
            
            // Update cursor for next load
            currentCursor = response.nextCursor;
        } catch (error) {
            console.error('Failed to load more products:', error);
        } finally {
            setIsLoading(false);
        }
    });

    // Product card - Add to cart (SIMPLE products) - for SSR products
    refs.products.addToCartButton.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;
        try {
            await storesContext.addToCart(productId, 1);
        } catch (error) {
            console.error('Failed to add to cart:', error);
        }
    });

    // Product card - Add to cart (SIMPLE products) - for loaded products
    refs.loadedProducts.addToCartButton.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;
        try {
            await storesContext.addToCart(productId, 1);
        } catch (error) {
            console.error('Failed to add to cart:', error);
        }
    });

    // Product card - Quick option choice (SINGLE_OPTION products) - for SSR products
    refs.products.quickOption.choices.choiceButton.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;
        await handleQuickOptionClick(productId, choiceId, storesContext);
    });

    // Product card - Quick option choice (SINGLE_OPTION products) - for loaded products
    refs.loadedProducts.quickOption.choices.choiceButton.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;
        const product = loadedProducts().find(p => p._id === productId);
        if (!product) return;

        const choice = product.quickOption?.choices?.find(c => c.choiceId === choiceId);
        if (!choice || !choice.inStock) {
            console.warn('Choice not available or out of stock');
            return;
        }

        try {
            const optionId = product.quickOption!._id;
            await storesContext.addToCart(productId, 1, {
                options: { [optionId]: choice.choiceId },
                modifiers: {},
                customTextFields: {}
            });
        } catch (error) {
            console.error('Failed to add to cart:', error);
        }
    });

    // Product card - View options button - for SSR products
    refs.products.viewOptionsButton.onclick(({ coordinate }) => {
        const [productId] = coordinate;
        // Note: SSR products aren't in interactive signals, would need to be handled differently
        // For now, navigate using the product URL from the DOM or coordinate
        window.location.href = `/products/${productId}`;
    });

    // Product card - View options button - for loaded products
    refs.loadedProducts.viewOptionsButton.onclick(({ coordinate }) => {
        const [productId] = coordinate;
        const product = loadedProducts().find(p => p._id === productId);
        if (product?.productUrl) {
            window.location.href = product.productUrl;
        }
    });

    return {
        render: () => ({
            loadedProducts: loadedProducts(),
            hasMore: hasMore(),
            loadedCount: loadedCount(),
            isLoading: isLoading(),
            hasProducts: hasProducts()
        })
    };
}

/**
 * Helper to handle quick option click for add to cart
 */
async function handleQuickOptionClick(
    productId: string,
    choiceId: string,
    storesContext: WixStoresContext
) {
    // For SSR products, we just add with the choice - product data is in DOM
    try {
        // Note: This assumes the optionId can be derived or is passed
        // In practice, SSR products should have their add-to-cart handled differently
        await storesContext.addToCart(productId, 1);
    } catch (error) {
        console.error('Failed to add to cart:', error);
    }
}

/**
 * Category Page Full-Stack Component
 * 
 * A headless category/collection page component with:
 * - Category metadata and breadcrumbs
 * - Product grid with parallel loading
 * - "Load More" button for additional products
 * - Add to cart functionality
 * 
 * Rendering phases:
 * - Slow: Category metadata + initial products (parallel loading)
 * - Fast: Load more state initialization
 * - Interactive: Load more button, add to cart
 * 
 * Usage:
 * ```typescript
 * import { categoryPage } from '@jay-framework/wix-stores';
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
