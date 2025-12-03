import { 
    makeJayStackComponent, 
    PageProps, 
    partialRender 
} from '@jay-framework/fullstack-component';
import { createSignal, Props } from '@jay-framework/component';
import { ProductCardContract, ProductCardRefs } from '../contracts/product-card.jay-contract';
import { WixStoresContext, WixStoresContextMarker } from './wix-stores-context';
import {WIX_STORES_SERVICE_MARKER} from "../stores-client/wix-stores-context";

/**
 * Product Card Props
 * Used to specify which product to display in the card
 */
export interface ProductCardProps {
    productId: string;
}

/**
 * Data carried forward from slow rendering to fast rendering
 */
interface ProductCardSlowCarryForward {
    productId: string;
    slug: string;
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface ProductCardFastCarryForward extends ProductCardSlowCarryForward {
    inStock: boolean;
}

/**
 * Slow Rendering Phase
 * Loads semi-static product data:
 * - Basic product info (name, slug)
 * - Media (main image, thumbnail)
 * - Base pricing
 * - Brand and ribbon
 * - Product type and visibility
 */
async function renderSlowlyChanging(
    props: ProductCardProps,
    wixStores: WixStoresContext
) {
    try {
        // Get product with required fields
        const response = await wixStores.products.getProduct(props.productId, {
            fields: [
                'MEDIA_ITEMS_INFO',
                'CURRENCY',
                'THUMBNAIL'
            ]
        });
        // @ts-expect-error - Wix SDK types are incomplete for V3 API, but runtime has product property
        const product = response.product || response;

        if (!product) {
            // Return empty state if product not found
            return partialRender(
                {
                    _id: props.productId,
                    name: 'Product not found',
                    visible: false
                },
                {
                    productId: props.productId,
                    slug: ''
                }
            );
        }

        const hasDiscount = product.compareAtPriceRange && 
                           product.compareAtPriceRange.minValue?.amount && 
                           product.actualPriceRange?.minValue?.amount &&
                           parseFloat(product.compareAtPriceRange.minValue.amount) > parseFloat(product.actualPriceRange.minValue.amount);

        return partialRender(
            {
                _id: product._id || props.productId,
                name: product.name || '',
                slug: product.slug || '',
                productLink: `/products/${product.slug}`,
                mainMedia: product.media?.itemsInfo?.items?.[0] ? {
                    url: product.media.itemsInfo.items[0].url || '',
                    altText: product.media.itemsInfo.items[0].altText || product.name || '',
                    mediaType: product.media.itemsInfo.items[0].mediaType || 'IMAGE'
                } : undefined,
                thumbnail: product.media?.itemsInfo?.items?.[0]?.thumbnail ? {
                    url: product.media.itemsInfo.items[0].thumbnail.url || '',
                    altText: product.media.itemsInfo.items[0].thumbnail.altText || product.name || '',
                    width: product.media.itemsInfo.items[0].thumbnail.width || 0,
                    height: product.media.itemsInfo.items[0].thumbnail.height || 0
                } : undefined,
                actualPriceRange: {
                    minValue: {
                        amount: product.actualPriceRange?.minValue?.amount || '0',
                        formattedAmount: product.actualPriceRange?.minValue?.formattedAmount || '$0.00'
                    },
                    maxValue: {
                        amount: product.actualPriceRange?.maxValue?.amount || '0',
                        formattedAmount: product.actualPriceRange?.maxValue?.formattedAmount || '$0.00'
                    }
                },
                compareAtPriceRange: product.compareAtPriceRange ? {
                    minValue: {
                        amount: product.compareAtPriceRange.minValue?.amount || '0',
                        formattedAmount: product.compareAtPriceRange.minValue?.formattedAmount || ''
                    },
                    maxValue: {
                        amount: product.compareAtPriceRange.maxValue?.amount || '0',
                        formattedAmount: product.compareAtPriceRange.maxValue?.formattedAmount || ''
                    }
                } : undefined,
                currency: product.currency || 'USD',
                hasDiscount,
                ribbon: product.ribbon ? {
                    _id: product.ribbon,
                    name: product.ribbon
                } : undefined,
                hasRibbon: !!product.ribbon,
                brand: product.brand ? {
                    _id: product.brand,
                    name: product.brand
                } : undefined,
                productType: product.productType || 'PHYSICAL',
                visible: product.visible !== false
            },
            {
                productId: product._id || props.productId,
                slug: product.slug || ''
            }
        );
    } catch (error) {
        console.error('Failed to render product card (slow):', error);
        return partialRender(
            {
                _id: props.productId,
                name: 'Error loading product',
                visible: false
            },
            {
                productId: props.productId,
                slug: ''
            }
        );
    }
}

/**
 * Fast Rendering Phase
 * Loads frequently changing data:
 * - Real-time inventory status
 * - Current availability
 */
async function renderFastChanging(
    props: ProductCardProps,
    carryForward: ProductCardSlowCarryForward,
    wixStores: WixStoresContext
) {
    try {
        // Query inventory for this product
        // Note: Inventory API might not have direct query support, so we handle gracefully
        let inStock = false;
        let preorderEnabled = false;
        
        try {
            const inventoryResponse = await (wixStores.inventory as any).queryInventory({
                filter: { productId: carryForward.productId }
            });
            const hasInventory = inventoryResponse.items && inventoryResponse.items.length > 0;
            const firstItem = inventoryResponse.items?.[0];
            
            inStock = hasInventory && (firstItem?.availableQuantity || 0) > 0;
            preorderEnabled = firstItem?.preorderInfo?.enabled || false;
        } catch (invError) {
            // Inventory might not be available, treat as out of stock
            console.warn('Inventory query failed:', invError);
        }

        return partialRender(
            {
                inventory: {
                    availabilityStatus: inStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
                    preorderStatus: preorderEnabled ? 'ENABLED' : 'DISABLED'
                }
            },
            {
                productId: carryForward.productId,
                slug: carryForward.slug,
                inStock
            }
        );
    } catch (error) {
        console.error('Failed to render product card (fast):', error);
        return partialRender(
            {
                inventory: {
                    availabilityStatus: 'OUT_OF_STOCK',
                    preorderStatus: 'DISABLED'
                }
            },
            {
                productId: carryForward.productId,
                slug: carryForward.slug,
                inStock: false
            }
        );
    }
}

/**
 * Interactive Phase (Client-Side)
 * Handles user interactions:
 * - Quick add to cart
 * - Product link navigation
 */
function ProductCardInteractive(
    props: Props<ProductCardProps & ProductCardFastCarryForward>,
    refs: ProductCardRefs
) {
    const [isAddingToCart, setIsAddingToCart] = createSignal(false);

    // Handle quick add to cart
    refs.addToCartButton.onclick(async () => {
        if (!props.inStock()) {
            console.warn('Product is out of stock');
            return;
        }

        setIsAddingToCart(true);
        try {
            // TODO: Implement cart API call
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('Adding to cart:', props.productId());
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setIsAddingToCart(false);
        }
    });

    // Handle product link click (optional - for analytics)
    refs.productLink.onclick(() => {
        console.log('Navigating to product:', props.slug());
    });

    return {
        render: () => ({
            isAddingToCart: isAddingToCart()
        })
    };
}

/**
 * Product Card Full-Stack Component
 * 
 * A headless product card component with server-side rendering and
 * real-time inventory status. Optimized for product listings and grids.
 * 
 * Note: This is not a page component - it's meant to be used within pages.
 * Pass a productId prop to render a specific product card.
 * 
 * Usage:
 * ```typescript
 * import { productCard } from '@jay-framework/wix-stores';
 * 
 * // Use in your page with a specific product ID
 * // The component will handle slow/fast rendering automatically
 * ```
 */
export const productCard = makeJayStackComponent<ProductCardContract>()
    .withProps<ProductCardProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withSlowlyRender(renderSlowlyChanging)
    // @ts-expect-error - Type inference issue with carry-forward parameters in component builder
    .withFastRender(renderFastChanging)
    .withInteractive(ProductCardInteractive);

