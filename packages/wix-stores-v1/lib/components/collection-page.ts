/**
 * Collection Page Component (V1)
 * 
 * A headless collection page using Wix Catalog V1 API.
 * V1 uses "collections" instead of V3's "categories".
 * 
 * Key V1 differences:
 * - Uses collections.queryCollections() instead of categories
 * - Uses skip-based pagination instead of cursor-based
 * - Products are fetched via products.queryProducts() with collectionIds filter
 */

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
import { WIX_STORES_V1_SERVICE_MARKER, WixStoresV1Service } from '../services/wix-stores-v1-service';
import { WIX_STORES_V1_CONTEXT, WixStoresV1Context } from '../contexts/wix-stores-v1-context';
import { mapProductToCard } from '../utils/product-mapper-v1';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';
import { MediaType } from '../contracts/category-page.jay-contract';

/**
 * URL parameters for collection page routes
 */
export interface CollectionPageParams extends UrlParams {
    slug: string;
}

const PAGE_SIZE = 20;

interface CollectionSlowCarryForward {
    collectionId: string;
    collectionSlug: string;
    totalProducts: number;
    products: ProductCardViewState[];
    currentOffset: number;
}

interface CollectionFastCarryForward {
    collectionId: string;
    totalProducts: number;
    currentOffset: number;
}

interface BreadcrumbItem {
    categoryId: string;
    categoryName: string;
    categorySlug: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load collection slugs for static site generation
 */
async function* loadCollectionParams(
    [wixStores]: [WixStoresV1Service]
): AsyncIterable<CollectionPageParams[]> {
    try {
        const result = await wixStores.collections.queryCollections().find();
        yield (result.items || [])
            .filter(col => col.slug)
            .map((col) => ({ slug: col.slug! }));
    } catch (error) {
        console.error('[CollectionPage V1] Failed to load collection slugs:', error);
        yield [];
    }
}

/**
 * Load products for a collection (V1 uses skip-based pagination)
 */
async function loadCollectionProducts(
    collectionId: string,
    wixStores: WixStoresV1Service,
    offset: number = 0
): Promise<{ products: ProductCardViewState[]; total: number }> {
    // Query products with collection filter
    const result = await wixStores.products.queryProducts()
        .hasSome('collectionIds', [collectionId])
        .skip(offset)
        .limit(PAGE_SIZE)
        .find();

    const products = (result.items || []).map(product => 
        mapProductToCard(product, '/products')
    );

    return { 
        products, 
        total: result.totalCount || products.length 
    };
}

/**
 * Map collection media to view state format
 */
function mapCollectionMedia(collection: { media?: { mainMedia?: { image?: { url?: string } } }; name?: string }): CategoryPageSlowViewState['media'] {
    const mainMedia = collection.media?.mainMedia;
    
    return {
        mainMedia: mainMedia?.image?.url ? {
            _id: '',
            url: mainMedia.image.url,
            altText: collection.name || '',
            mediaType: MediaType.IMAGE
        } : undefined,
        items: []
    };
}

// ============================================================================
// Rendering Functions
// ============================================================================

async function renderSlowlyChanging(
    props: PageProps & CollectionPageParams,
    wixStores: WixStoresV1Service
): Promise<SlowlyRenderResult<CategoryPageSlowViewState, CollectionSlowCarryForward>> {
    const Pipeline = RenderPipeline.for<CategoryPageSlowViewState, CollectionSlowCarryForward>();

    return Pipeline
        .try(async () => {
            // Query all collections and filter by slug
            // V1 collections API doesn't support .eq('slug', ...) directly
            const result = await wixStores.collections.queryCollections().find();
            
            const collection = (result.items || []).find(col => col.slug === props.slug);

            if (!collection) {
                throw new Error('Collection not found');
            }
            
            // Load initial products
            const productData = await loadCollectionProducts(collection._id!, wixStores, 0);

            return { collection, productData };
        })
        .recover(error => {
            console.error('[CollectionPage V1] Failed to load collection:', error);
            return Pipeline.clientError(404, 'Collection not found');
        })
        .toPhaseOutput((data) => {
            const { collection, productData } = data;
            
            // V1 doesn't have hierarchical collections, so breadcrumb is just current
            const breadcrumbs: BreadcrumbItem[] = [{
                categoryId: collection._id || '',
                categoryName: collection.name || '',
                categorySlug: collection.slug || ''
            }];

            return {
                viewState: {
                    _id: collection._id || '',
                    name: collection.name || '',
                    description: collection.description || '',
                    slug: collection.slug || '',
                    visible: true,
                    numberOfProducts: collection.numberOfProducts || productData.total,
                    media: mapCollectionMedia(collection),
                    breadcrumbs,
                    products: productData.products
                },
                carryForward: {
                    collectionId: collection._id || '',
                    collectionSlug: collection.slug || '',
                    totalProducts: productData.total,
                    products: productData.products,
                    currentOffset: productData.products.length
                }
            };
        });
}

async function renderFastChanging(
    props: PageProps & CollectionPageParams,
    slowCarryForward: CollectionSlowCarryForward,
    _wixStores: WixStoresV1Service
) {
    const Pipeline = RenderPipeline.for<CategoryPageFastViewState, CollectionFastCarryForward>();

    const hasMore = slowCarryForward.currentOffset < slowCarryForward.totalProducts;

    return Pipeline
        .ok(slowCarryForward)
        .toPhaseOutput((data) => {
            return {
                viewState: {
                    // Products array with fast+interactive properties for SSR items
                    products: data.products.map(p => ({
                        _id: p._id,
                        isAddingToCart: false,
                        quickOption: p.quickOption ? {
                            choices: p.quickOption.choices.map(c => ({
                                choiceId: c.choiceId,
                                inStock: c.inStock,
                                isSelected: c.isSelected
                            }))
                        } : { choices: [] }
                    })),
                    loadedProducts: [],
                    hasMore,
                    loadedCount: data.products.length,
                    isLoading: false,
                    hasProducts: data.products.length > 0
                },
                carryForward: {
                    collectionId: data.collectionId,
                    totalProducts: data.totalProducts,
                    currentOffset: data.currentOffset
                }
            };
        });
}

// ============================================================================
// Interactive Phase
// ============================================================================

function CollectionPageInteractive(
    _props: Props<PageProps & CollectionPageParams>,
    refs: CategoryPageRefs,
    viewStateSignals: Signals<CategoryPageFastViewState>,
    fastCarryForward: CollectionFastCarryForward,
    storesContext: WixStoresV1Context
) {
    const {
        products: [products],
        loadedProducts: [loadedProducts, setLoadedProducts],
        hasMore: [hasMore, setHasMore],
        loadedCount: [loadedCount, setLoadedCount],
        isLoading: [isLoading, setIsLoading],
        hasProducts: [hasProducts, setHasProducts]
    } = viewStateSignals;

    const { collectionId, totalProducts } = fastCarryForward;
    
    // Track offset for page-based pagination
    let currentOffset = fastCarryForward.currentOffset;

    // Load More button handler
    refs.loadMoreButton?.onclick(async () => {
        if (isLoading() || !hasMore()) return;

        setIsLoading(true);

        try {
            const response = await storesContext.loadMoreCollectionProducts(
                collectionId,
                currentOffset,
                PAGE_SIZE
            );

            const currentLoaded = loadedProducts();
            setLoadedProducts([...currentLoaded, ...response.products]);
            
            currentOffset += response.products.length;
            setLoadedCount(loadedCount() + response.products.length);
            setHasMore(currentOffset < totalProducts);
            setHasProducts(true);
        } catch (error) {
            console.error('[CollectionPage V1] Failed to load more products:', error);
        } finally {
            setIsLoading(false);
        }
    });

    // Product card - Add to cart (SIMPLE products) - for SSR products
    refs.products?.addToCartButton?.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;
        try {
            await storesContext.addToCart(productId, 1);
        } catch (error) {
            console.error('[CollectionPage V1] Failed to add to cart:', error);
        }
    });

    // Product card - Add to cart (SIMPLE products) - for loaded products
    refs.loadedProducts?.addToCartButton?.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;
        try {
            await storesContext.addToCart(productId, 1);
        } catch (error) {
            console.error('[CollectionPage V1] Failed to add to cart:', error);
        }
    });

    // Product card - Quick option choice - for SSR products
    refs.products?.quickOption?.choices?.choiceButton?.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;
        try {
            // For V1, choiceId maps to variantId
            await storesContext.addToCart(productId, 1, choiceId);
        } catch (error) {
            console.error('[CollectionPage V1] Failed to add to cart:', error);
        }
    });

    // Product card - Quick option choice - for loaded products
    refs.loadedProducts?.quickOption?.choices?.choiceButton?.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;
        const product = loadedProducts().find(p => p._id === productId);
        if (!product) return;

        const choice = product.quickOption?.choices?.find(c => c.choiceId === choiceId);
        if (!choice || !choice.inStock) {
            console.warn('[CollectionPage V1] Choice not available or out of stock');
            return;
        }

        try {
            await storesContext.addToCart(productId, 1, choice.variantId);
        } catch (error) {
            console.error('[CollectionPage V1] Failed to add to cart:', error);
        }
    });

    // View options button - for loaded products
    refs.loadedProducts?.viewOptionsButton?.onclick(({ coordinate }) => {
        const [productId] = coordinate;
        const product = loadedProducts().find(p => p._id === productId);
        if (product?.productUrl) {
            window.location.href = product.productUrl;
        }
    });

    return {
        render: () => ({
            products: products(),
            loadedProducts: loadedProducts(),
            hasMore: hasMore(),
            loadedCount: loadedCount(),
            isLoading: isLoading(),
            hasProducts: hasProducts()
        })
    };
}

// ============================================================================
// Component Export
// ============================================================================

/**
 * Collection Page Component (V1)
 *
 * A headless collection page using Wix Catalog V1 API.
 * Uses the same contract as category-page for template compatibility.
 */
export const collectionPage = makeJayStackComponent<CategoryPageContract>()
    .withProps<PageProps>()
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withContexts(WIX_STORES_V1_CONTEXT)
    .withLoadParams(loadCollectionParams)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(CollectionPageInteractive);

// Also export as categoryPage for drop-in compatibility
export const categoryPage = collectionPage;
