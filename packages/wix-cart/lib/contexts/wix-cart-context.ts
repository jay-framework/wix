/**
 * Client-side Wix Cart Context
 *
 * Provides access to Wix Cart APIs on the client using OAuth authentication.
 * Gets WIX_CLIENT_CONTEXT injected during initialization.
 *
 * Usage in interactive components:
 * ```typescript
 * const cartContext = useContext(WIX_CART_CONTEXT);
 * // Reactive cart indicator signals
 * const count = cartContext.cartIndicator.itemCount();
 * const hasItems = cartContext.cartIndicator.hasItems();
 * // Cart operations
 * await cartContext.addToCart(productId, 1);
 * const cartState = await cartContext.getEstimatedCart();
 * ```
 */

import { createJayContext, useGlobalContext, EventEmitter } from '@jay-framework/runtime';
import {
    createSignal,
    createEvent,
    registerReactiveGlobalContext,
    useReactive,
} from '@jay-framework/component';
import { Getter } from '@jay-framework/reactive';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
import {
    addToCurrentCart as addToCartApi,
    removeLineItemsFromCurrentCart as removeLineItemsApi,
    updateCurrentCartLineItemQuantity as updateQuantityApi,
    updateCurrentCart as updateCartApi,
    removeCouponFromCurrentCart as removeCouponApi,
    createCheckoutFromCurrentCart as createCheckoutApi,
    createRedirectSession as createRedirectSessionApi,
} from '../wix-apis/index.js';
import {
    CartState,
    estimateCurrentCartTotalsOrNull,
    getCurrentCartOrNull,
    mapCartToIndicator,
    mapCartToState,
    mapEstimateTotalsToState,
} from './cart-helpers';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration passed from server to client for Wix Cart.
 */
export interface WixCartInitData {
    /** Enable client-side cart operations */
    enableClientCart: boolean;
    /** URL path for post-checkout redirect (default: /thank-you) */
    thankYouUrl: string;
}

/** Wix Stores App ID for catalog references */
const WIX_STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

/**
 * Reactive cart indicator state.
 * Signals update automatically when cart operations occur.
 */
export interface ReactiveCartIndicator {
    /** Number of items in cart (reactive signal) */
    itemCount: Getter<number>;
    /** Whether cart has items (reactive signal) */
    hasItems: Getter<boolean>;
}

/**
 * Result of a cart operation that modifies items.
 */
export interface CartOperationResult {
    /** Updated cart state after the operation */
    cartState: CartState;
}

/**
 * Options for add to cart operation.
 * Used by consumers (wix-stores, wix-stores-v1) to pass variant information.
 */
export interface AddToCartOptions {
    /** Variant ID for the product */
    variantId?: string;
    /** Custom text fields as (key, value) pairs */
    customTextFields?: Record<string, string>;
    /** Modifiers as (key, value) pairs */
    modifiers?: Record<string, string>;
    /** Product slug for building the correct product page URL in cart */
    productSlug?: string;
}

/**
 * Client-side Wix Cart context interface.
 * Provides reactive cart indicator and encapsulated cart operations.
 */
export interface WixCartContext {
    // ========================================================================
    // Reactive Cart Indicator
    // ========================================================================

    /**
     * Reactive cart indicator signals.
     * Use these in render functions for automatic updates.
     */
    cartIndicator: ReactiveCartIndicator;

    // ========================================================================
    // Cart Operations
    // ========================================================================

    /**
     * Refresh cart indicator from server.
     * Call this after external cart changes or on page load.
     */
    refreshCartIndicator(): Promise<void>;

    /**
     * Get full cart state with estimated totals (subtotal, tax, total).
     * Handles 404 (no cart) as empty cart.
     * Use this for cart pages where accurate totals are needed.
     */
    getEstimatedCart(): Promise<CartState>;

    /**
     * Add a product to the cart.
     * Automatically updates the cart indicator signals.
     *
     * @param productId - The product ID to add
     * @param quantity - Number of items to add (default: 1)
     * @param options - Variant and modifier options
     * @returns Updated cart state
     */
    addToCart(
        productId: string,
        quantity?: number,
        options?: AddToCartOptions,
    ): Promise<CartOperationResult>;

    /**
     * Remove line items from the cart.
     * Automatically updates the cart indicator signals.
     *
     * @param lineItemIds - Array of line item IDs to remove
     * @returns Updated cart state
     */
    removeLineItems(lineItemIds: string[]): Promise<CartOperationResult>;

    /**
     * Update a line item's quantity.
     * If quantity is 0, the item is removed.
     * Automatically updates the cart indicator signals.
     *
     * @param lineItemId - The line item ID to update
     * @param quantity - New quantity (0 removes the item)
     * @returns Updated cart state
     */
    updateLineItemQuantity(lineItemId: string, quantity: number): Promise<CartOperationResult>;

    /**
     * Clear all items from the cart.
     * Automatically updates the cart indicator signals.
     */
    clearCart(): Promise<void>;

    /**
     * Apply a coupon code to the cart.
     * Automatically updates the cart indicator signals.
     *
     * @param couponCode - The coupon code to apply
     * @returns Updated cart state
     */
    applyCoupon(couponCode: string): Promise<CartOperationResult>;

    /**
     * Remove applied coupon from the cart.
     * Automatically updates the cart indicator signals.
     *
     * @returns Updated cart state
     */
    removeCoupon(): Promise<CartOperationResult>;

    /**
     * Create a Wix checkout redirect session and return the URL.
     * Redirects the user to Wix's hosted checkout page.
     */
    checkout(): Promise<string>;

    // ========================================================================
    // Events
    // ========================================================================

    onItemAddedToCart: EventEmitter<void, any>;
}

/**
 * Context marker for client-side Wix Cart operations.
 */
export const WIX_CART_CONTEXT = createJayContext<WixCartContext>('wix:cart');

// ============================================================================
// Context Factory
// ============================================================================

/**
 * Initialize and register the Wix Cart client context.
 * Called during client-side initialization.
 *
 * Assumes WIX_CLIENT_CONTEXT is already initialized with a valid client.
 *
 * @returns The created context for immediate use (e.g., to call refreshCartIndicator)
 */
export function provideWixCartContext(thankYouUrl: string = '/thank-you'): WixCartContext {
    // Get the Wix client from wix-server-client plugin (injected)
    const wixClientContext = useGlobalContext(WIX_CLIENT_CONTEXT);
    const wixClient = wixClientContext.client;

    // Create and register the reactive cart context
    const cartContext = registerReactiveGlobalContext(WIX_CART_CONTEXT, () => {
        // Reactive signals for cart indicator
        const [itemCount, setItemCount] = createSignal(0);
        const [hasItems, setHasItems] = createSignal(false);
        const reactive = useReactive();
        const onItemAddedToCart = createEvent<void>();

        // Helper to update indicator signals from cart data
        function updateIndicatorFromCart(cart: Awaited<ReturnType<typeof getCurrentCartOrNull>>) {
            const indicator = mapCartToIndicator(cart);
            reactive.batchReactions(() => {
                setItemCount(indicator.itemCount);
                setHasItems(indicator.hasItems);
            });
        }

        // Refresh cart indicator from server
        async function refreshCartIndicator(): Promise<void> {
            const cart = await getCurrentCartOrNull(wixClient);
            updateIndicatorFromCart(cart);
        }

        // Get full cart state with estimated totals
        async function getEstimatedCart(): Promise<CartState> {
            const estimate = await estimateCurrentCartTotalsOrNull(wixClient);
            return mapEstimateTotalsToState(estimate);
        }

        // Add product to cart
        async function addToCart(
            productId: string,
            quantity: number = 1,
            options?: AddToCartOptions,
        ): Promise<CartOperationResult> {
            console.log(`[WixCart] Adding to cart: ${productId} x ${quantity}`, options);

            const catalogOptions: Record<string, unknown> = {};
            if (options?.variantId) catalogOptions.variantId = options.variantId;
            if (options?.modifiers) catalogOptions.options = options.modifiers;
            if (options?.customTextFields) catalogOptions.customTextFields = options.customTextFields;

            const lineItem = {
                catalogReference: {
                    catalogItemId: productId,
                    appId: WIX_STORES_APP_ID,
                    ...(Object.keys(catalogOptions).length > 0 ? { options: catalogOptions } : {}),
                },
                quantity,
            };

            const result = await addToCartApi(wixClient, [lineItem]);

            updateIndicatorFromCart(result.cart ?? null);
            onItemAddedToCart.emit();
            return { cartState: mapCartToState(result.cart ?? null) };
        }

        // Remove line items from cart
        async function removeLineItems(lineItemIds: string[]): Promise<CartOperationResult> {
            const result = await removeLineItemsApi(wixClient, lineItemIds);
            updateIndicatorFromCart(result.cart ?? null);
            return { cartState: mapCartToState(result.cart ?? null) };
        }

        // Update line item quantity
        async function updateLineItemQuantity(
            lineItemId: string,
            quantity: number,
        ): Promise<CartOperationResult> {
            let result;
            if (quantity === 0) {
                result = await removeLineItemsApi(wixClient, [lineItemId]);
            } else {
                result = await updateQuantityApi(wixClient, [{ _id: lineItemId, quantity }]);
            }
            updateIndicatorFromCart(result.cart ?? null);
            return { cartState: mapCartToState(result.cart ?? null) };
        }

        // Clear all items from cart
        async function clearCart(): Promise<void> {
            const cart = await getCurrentCartOrNull(wixClient);
            if (cart?.lineItems?.length) {
                const lineItemIds = cart.lineItems
                    .map((item: { _id?: string }) => item._id || '')
                    .filter(Boolean);
                if (lineItemIds.length > 0) {
                    await removeLineItemsApi(wixClient, lineItemIds);
                }
            }
            setItemCount(0);
            setHasItems(false);
        }

        // Apply coupon to cart
        async function applyCoupon(couponCode: string): Promise<CartOperationResult> {
            const result = await updateCartApi(wixClient, { couponCode });
            updateIndicatorFromCart(result ?? null);
            return { cartState: mapCartToState(result ?? null) };
        }

        // Remove coupon from cart
        async function removeCoupon(): Promise<CartOperationResult> {
            const result = await removeCouponApi(wixClient);
            updateIndicatorFromCart(result.cart ?? null);
            return { cartState: mapCartToState(result.cart ?? null) };
        }

        async function checkout(): Promise<string> {
            const { checkoutId } = await createCheckoutApi(wixClient);
            if (!checkoutId) throw new Error('Failed to create checkout from cart');

            const postFlowUrl = window.location.origin + thankYouUrl;
            const { redirectSession } = await createRedirectSessionApi(wixClient, {
                ecomCheckout: { checkoutId },
                callbacks: { postFlowUrl },
            });
            if (!redirectSession?.fullUrl) {
                throw new Error('Failed to create checkout redirect session');
            }
            return redirectSession.fullUrl;
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
            checkout,
            onItemAddedToCart,
        };
    });

    console.log('[wix-cart] Client cart context initialized (reactive)');
    return cartContext;
}
