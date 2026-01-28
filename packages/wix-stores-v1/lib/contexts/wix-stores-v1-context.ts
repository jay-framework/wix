/**
 * Client-side Wix Stores V1 Context
 * 
 * Provides access to Wix Stores Catalog V1 APIs on the client using OAuth authentication.
 * Cart operations use the same @wix/ecom API as V3.
 * 
 * Usage in interactive components:
 * ```typescript
 * const storesContext = useContext(WIX_STORES_V1_CONTEXT);
 * // Reactive cart indicator signals
 * const count = storesContext.cartIndicator.itemCount();
 * // Cart operations
 * await storesContext.addToCart(productId, 1);
 * ```
 */

import { createJayContext, useGlobalContext } from '@jay-framework/runtime';
import { createSignal, registerReactiveGlobalContext, useReactive } from '@jay-framework/component';
import { Getter } from '@jay-framework/reactive';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
import { getCollectionsClient, getCurrentCartClient, getProductsClient } from '../utils/wix-store-v1-api';
import { mapProductToCard, CollectionViewState, mapCollectionToViewState } from '../utils/product-mapper-v1';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';
import {
    CartState,
    getCurrentCartOrNull,
    estimateCurrentCartTotalsOrNull,
    mapCartToIndicator,
    mapCartToState,
    mapEstimateTotalsToState
} from './cart-helpers';
import { LineItem } from "@wix/auto_sdk_ecom_current-cart";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration passed from server to client for Wix Stores V1.
 */
export interface WixStoresV1InitData {
    /** Enable client-side cart operations */
    enableClientCart: boolean;
    /** Enable client-side search */
    enableClientSearch: boolean;
}

/** Wix Stores App ID for catalog references */
const WIX_STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

/**
 * Reactive cart indicator state.
 */
export interface ReactiveCartIndicator {
    itemCount: Getter<number>;
    hasItems: Getter<boolean>;
}

/**
 * Result of a cart operation that modifies items.
 */
export interface CartOperationResult {
    cartState: CartState;
}

/**
 * Client-side Wix Stores V1 context interface.
 */
export interface WixStoresV1Context {
    // Reactive Cart Indicator
    cartIndicator: ReactiveCartIndicator;
    
    // Cart Operations (same as V3 - uses @wix/ecom)
    refreshCartIndicator(): Promise<void>;
    getEstimatedCart(): Promise<CartState>;
    addToCart(productId: string, quantity?: number, variantId?: string): Promise<CartOperationResult>;
    removeLineItems(lineItemIds: string[]): Promise<CartOperationResult>;
    updateLineItemQuantity(lineItemId: string, quantity: number): Promise<CartOperationResult>;
    clearCart(): Promise<void>;
    applyCoupon(couponCode: string): Promise<CartOperationResult>;
    removeCoupon(): Promise<CartOperationResult>;
    
    // Collection Operations (V1 uses collections, not categories)
    loadMoreCollectionProducts(
        collectionId: string,
        page: number,
        pageSize: number
    ): Promise<{
        products: ProductCardViewState[];
        hasMore: boolean;
        totalProducts: number;
    }>;
    
    getCollections(): Promise<CollectionViewState[]>;
}

/**
 * Context marker for client-side Wix Stores V1 operations.
 */
export const WIX_STORES_V1_CONTEXT = createJayContext<WixStoresV1Context>();

// ============================================================================
// Context Factory
// ============================================================================

/**
 * Initialize and register the Wix Stores V1 client context.
 */
export function provideWixStoresV1Context(): WixStoresV1Context {
    const wixClientContext = useGlobalContext(WIX_CLIENT_CONTEXT);
    const wixClient = wixClientContext.client;

    // Get API clients (V1 versions)
    const cartClient = getCurrentCartClient(wixClient);
    const productsClient = getProductsClient(wixClient);
    const collectionsClient = getCollectionsClient(wixClient);

    const storesContext = registerReactiveGlobalContext(WIX_STORES_V1_CONTEXT, () => {
        const [itemCount, setItemCount] = createSignal(0);
        const [hasItems, setHasItems] = createSignal(false);
        const reactive = useReactive();

        function updateIndicatorFromCart(cart: Awaited<ReturnType<typeof getCurrentCartOrNull>>) {
            const indicator = mapCartToIndicator(cart);
            reactive.batchReactions(() => {
                setItemCount(indicator.itemCount);
                setHasItems(indicator.hasItems);
            });
        }

        async function refreshCartIndicator(): Promise<void> {
            const cart = await getCurrentCartOrNull(cartClient);
            updateIndicatorFromCart(cart);
        }

        async function getEstimatedCart(): Promise<CartState> {
            const estimate = await estimateCurrentCartTotalsOrNull(cartClient);
            return mapEstimateTotalsToState(estimate);
        }

        async function addToCart(
            productId: string, 
            quantity: number = 1, 
            variantId?: string
        ): Promise<CartOperationResult> {
            console.log(`[wix-stores-v1] Adding to cart: ${productId} x ${quantity}`);
            
            // For V1, get the product to find variant if not specified
            let finalVariantId = variantId;
            if (!finalVariantId) {
                try {
                    const productResult = await productsClient.getProduct(productId);
                    const product = productResult.product;
                    if (product?.variants?.[0]) {
                        finalVariantId = product.variants[0]._id;
                    }
                } catch (err) {
                    console.warn('Could not fetch product for variant ID:', err);
                }
            }

            const lineItem: LineItem = {
                catalogReference: {
                    catalogItemId: productId,
                    appId: WIX_STORES_APP_ID,
                    options: finalVariantId ? { variantId: finalVariantId } : {}
                },
                quantity,
            };
            
            const result = await cartClient.addToCurrentCart({
                lineItems: [lineItem],
            });
            
            updateIndicatorFromCart(result.cart ?? null);
            return { cartState: mapCartToState(result.cart ?? null) };
        }

        async function removeLineItems(lineItemIds: string[]): Promise<CartOperationResult> {
            const result = await cartClient.removeLineItemsFromCurrentCart(lineItemIds);
            updateIndicatorFromCart(result.cart ?? null);
            return { cartState: mapCartToState(result.cart ?? null) };
        }

        async function updateLineItemQuantity(lineItemId: string, quantity: number): Promise<CartOperationResult> {
            let result;
            if (quantity === 0) {
                result = await cartClient.removeLineItemsFromCurrentCart([lineItemId]);
            } else {
                result = await cartClient.updateCurrentCartLineItemQuantity([
                    { _id: lineItemId, quantity }
                ]);
            }
            updateIndicatorFromCart(result.cart ?? null);
            return { cartState: mapCartToState(result.cart ?? null) };
        }

        async function clearCart(): Promise<void> {
            const cart = await getCurrentCartOrNull(cartClient);
            if (cart?.lineItems?.length) {
                const lineItemIds = cart.lineItems
                    .map((item: { _id?: string }) => item._id || '')
                    .filter(Boolean);
                if (lineItemIds.length > 0) {
                    await cartClient.removeLineItemsFromCurrentCart(lineItemIds);
                }
            }
            setItemCount(0);
            setHasItems(false);
        }

        async function applyCoupon(couponCode: string): Promise<CartOperationResult> {
            const result = await cartClient.updateCurrentCart({ couponCode });
            updateIndicatorFromCart(result ?? null);
            return { cartState: mapCartToState(result ?? null) };
        }

        async function removeCoupon(): Promise<CartOperationResult> {
            const result = await cartClient.removeCouponFromCurrentCart();
            updateIndicatorFromCart(result.cart ?? null);
            return { cartState: mapCartToState(result.cart ?? null) };
        }

        // V1 uses skip-based pagination for collections
        async function loadMoreCollectionProducts(
            collectionId: string,
            page: number,
            pageSize: number
        ): Promise<{ products: ProductCardViewState[]; hasMore: boolean; totalProducts: number }> {
            try {
                const result = await productsClient.queryProducts()
                    .hasSome('collectionIds', [collectionId])
                    .skip((page - 1) * pageSize)
                    .limit(pageSize)
                    .find();

                const products = ((result.items || [])).map(p => mapProductToCard(p));
                const totalProducts = result.totalCount ?? products.length;
                const hasMore = page * pageSize < totalProducts;

                return { products, hasMore, totalProducts };
            } catch (error) {
                console.error('[wix-stores-v1] Failed to load collection products:', error);
                return { products: [], hasMore: false, totalProducts: 0 };
            }
        }

        async function getCollections(): Promise<CollectionViewState[]> {
            try {
                const result = await collectionsClient.queryCollections().find();
                return (result.items || []).map(col => mapCollectionToViewState(col));
            } catch (error) {
                console.error('[wix-stores-v1] Failed to load collections:', error);
                return [];
            }
        }

        return {
            cartIndicator: {
                itemCount,
                hasItems,
            },
            refreshCartIndicator,
            getEstimatedCart,
            addToCart,
            removeLineItems,
            updateLineItemQuantity,
            clearCart,
            applyCoupon,
            removeCoupon,
            loadMoreCollectionProducts,
            getCollections,
        };
    });

    console.log('[wix-stores-v1] Client stores context initialized');
    return storesContext;
}
