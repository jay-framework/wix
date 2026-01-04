/**
 * Cart Page Component
 *
 * Full cart page with line item management, quantity updates, and checkout.
 * Uses the Wix eCommerce Cart API via client context.
 */

import {
    makeJayStackComponent,
    RenderPipeline,
    Signals,
    PageProps
} from '@jay-framework/fullstack-component';
import { createEffect, Props } from '@jay-framework/component';
import { useGlobalContext } from '@jay-framework/runtime';
import {
    CartPageContract,
    CartPageFastViewState,
    CartPageRefs,
    CartPageSlowViewState,
    LineItemOfCartPageViewState
} from '../contracts/cart-page.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import { 
    WIX_STORES_CONTEXT,
    CartState,
    CartLineItem,
    mapCartToState,
    getEmptyCartState,
    mapLineItem
} from '../contexts/index.js';
import { patch, REPLACE } from '@jay-framework/json-patch';

// ============================================================================
// Types
// ============================================================================

interface CartPageSlowCarryForward {
    // No data to carry forward from slow phase
}

interface CartPageFastCarryForward {
    // No data to carry forward
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map CartLineItem to view state line item
 */
function mapLineItemToViewState(item: CartLineItem): LineItemOfCartPageViewState {
    return {
        lineItemId: item.lineItemId,
        productId: item.productId,
        productName: item.productName,
        productUrl: item.productUrl,
        variantName: item.variantName,
        sku: item.sku,
        image: item.image,
        quantity: item.quantity,
        isUpdatingQuantity: false,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        lineDiscount: item.lineDiscount,
        hasDiscount: item.hasDiscount,
        isRemoving: false
    };
}

/**
 * Map CartState to view state
 */
function mapCartStateToViewState(cart: CartState): CartPageFastViewState {
    return {
        isEmpty: cart.isEmpty,
        isLoading: false,
        isCheckingOut: false,
        lineItems: cart.lineItems.map(mapLineItemToViewState),
        summary: {
            itemCount: cart.summary.itemCount,
            subtotal: cart.summary.subtotal,
            discount: cart.summary.discount,
            hasDiscount: cart.summary.hasDiscount,
            estimatedTax: cart.summary.estimatedTax,
            showTax: cart.summary.showTax,
            estimatedTotal: cart.summary.estimatedTotal,
            currency: cart.summary.currency
        },
        coupon: {
            code: '',
            isApplying: false,
            appliedCode: cart.appliedCoupon,
            hasAppliedCoupon: cart.hasAppliedCoupon,
            errorMessage: '',
            hasError: false
        }
    };
}

/**
 * Create initial empty cart view state
 */
function createEmptyCartViewState(): CartPageFastViewState {
    return {
        isEmpty: true,
        isLoading: true,
        isCheckingOut: false,
        lineItems: [],
        summary: {
            itemCount: 0,
            subtotal: { amount: '0', formattedAmount: '$0.00' },
            discount: { amount: '0', formattedAmount: '' },
            hasDiscount: false,
            estimatedTax: { amount: '0', formattedAmount: '' },
            showTax: false,
            estimatedTotal: { amount: '0', formattedAmount: '$0.00' },
            currency: 'USD'
        },
        coupon: {
            code: '',
            isApplying: false,
            appliedCode: '',
            hasAppliedCoupon: false,
            errorMessage: '',
            hasError: false
        }
    };
}

// ============================================================================
// Rendering Functions
// ============================================================================

/**
 * Slow render phase - minimal static content
 */
async function renderSlowlyChanging(
    _props: PageProps,
    _wixStores: WixStoresService
) {
    const Pipeline = RenderPipeline.for<CartPageSlowViewState, CartPageSlowCarryForward>();

    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            cartId: '',
            emptyCartMessage: 'Your cart is empty'
        },
        carryForward: {}
    }));
}

/**
 * Fast render phase - show loading state
 */
async function renderFastChanging(
    _props: PageProps,
    _slowCarryForward: CartPageSlowCarryForward,
    _wixStores: WixStoresService
) {
    const Pipeline = RenderPipeline.for<CartPageFastViewState, CartPageFastCarryForward>();

    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: createEmptyCartViewState(),
        carryForward: {}
    }));
}

/**
 * Interactive phase - load cart and set up interactions
 */
function CartPageInteractive(
    _props: Props<PageProps>,
    refs: CartPageRefs,
    viewStateSignals: Signals<CartPageFastViewState>,
    _carryForward: CartPageFastCarryForward
) {
    // Get the stores context for client-side cart operations
    const storesContext = useGlobalContext(WIX_STORES_CONTEXT);

    // Get signal setters from viewStateSignals
    const {
        isEmpty: [isEmpty, setIsEmpty],
        isLoading: [isLoading, setIsLoading],
        isCheckingOut: [isCheckingOut, setIsCheckingOut],
        lineItems: [lineItems, setLineItems],
        summary: [summary, setSummary],
        coupon: [coupon, setCoupon]
    } = viewStateSignals;

    // Load cart data using client context
    async function loadCart() {
        try {
            setIsLoading(true);
            const cart = await storesContext.cart.getCurrentCart();
            const cartState = mapCartToState(cart);
            const viewState = mapCartStateToViewState(cartState);
            
            setIsEmpty(viewState.isEmpty);
            setLineItems(viewState.lineItems);
            setSummary(viewState.summary);
            setCoupon(viewState.coupon);
        } catch (error) {
            console.error('[CartPage] Failed to load cart:', error);
        } finally {
            setIsLoading(false);
        }
    }

    // Update cart from cart state
    function updateFromCart(cart: CartState) {
        const viewState = mapCartStateToViewState(cart);
        setIsEmpty(viewState.isEmpty);
        setLineItems(viewState.lineItems);
        setSummary(viewState.summary);
        setCoupon(prev => ({
            ...prev,
            appliedCode: viewState.coupon.appliedCode,
            hasAppliedCoupon: viewState.coupon.hasAppliedCoupon
        }));

        // Dispatch cart update event for cart indicator
        window.dispatchEvent(new CustomEvent('wix-cart-updated', {
            detail: {
                itemCount: cart.summary.itemCount,
                hasItems: !cart.isEmpty,
                subtotal: {
                    amount: cart.summary.subtotal.amount,
                    formattedAmount: cart.summary.subtotal.formattedAmount,
                    currency: cart.summary.currency
                }
            }
        }));
    }

    // Handle quantity update
    async function handleQuantityChange(lineItemId: string, newQuantity: number) {
        // Update local state immediately for responsiveness
        setLineItems(items =>
            items.map(item =>
                item.lineItemId === lineItemId
                    ? { ...item, isUpdatingQuantity: true }
                    : item
            )
        );

        try {
            let result;
            if (newQuantity === 0) {
                // Remove item if quantity is 0
                result = await storesContext.cart.removeLineItemsFromCurrentCart([lineItemId]);
            } else {
                // Update quantity
                result = await storesContext.cart.updateCurrentCartLineItemQuantity([
                    { _id: lineItemId, quantity: newQuantity }
                ]);
            }
            
            if (result.cart) {
                updateFromCart(mapCartToState(result.cart));
            }
        } catch (error) {
            console.error('[CartPage] Failed to update quantity:', error);
        }

        // Clear updating state
        setLineItems(items =>
            items.map(item =>
                item.lineItemId === lineItemId
                    ? { ...item, isUpdatingQuantity: false }
                    : item
            )
        );
    }

    // Handle item removal
    async function handleRemoveItem(lineItemId: string) {
        setLineItems(items =>
            items.map(item =>
                item.lineItemId === lineItemId
                    ? { ...item, isRemoving: true }
                    : item
            )
        );

        try {
            const result = await storesContext.cart.removeLineItemsFromCurrentCart([lineItemId]);
            if (result.cart) {
                updateFromCart(mapCartToState(result.cart));
            }
        } catch (error) {
            console.error('[CartPage] Failed to remove item:', error);
            setLineItems(items =>
                items.map(item =>
                    item.lineItemId === lineItemId
                        ? { ...item, isRemoving: false }
                        : item
                )
            );
        }
    }

    // Handle clear cart
    async function handleClearCart() {
        try {
            setIsLoading(true);
            
            // Get current cart to get all line item IDs
            const cart = await storesContext.cart.getCurrentCart();
            if (cart?.lineItems?.length) {
                const lineItemIds = cart.lineItems
                    .map((item: { _id?: string }) => item._id || '')
                    .filter(Boolean);
                if (lineItemIds.length > 0) {
                    await storesContext.cart.removeLineItemsFromCurrentCart(lineItemIds);
                }
            }
            
            await loadCart();
        } catch (error) {
            console.error('[CartPage] Failed to clear cart:', error);
            setIsLoading(false);
        }
    }

    // Handle coupon removal
    async function handleRemoveCoupon() {
        try {
            const result = await storesContext.cart.removeCouponFromCurrentCart();
            if (result.cart) {
                updateFromCart(mapCartToState(result.cart));
            }
        } catch (error) {
            console.error('[CartPage] Failed to remove coupon:', error);
        }
    }

    // Handle checkout
    async function handleCheckout() {
        setIsCheckingOut(true);
        // For now, just redirect to check out page
        window.location.href = '/checkout';
    }

    // Set up interactive refs
    createEffect(() => {
        // Clear cart button
        refs.clearCartButton?.onclick(handleClearCart);

        // Checkout button
        refs.checkoutButton?.onclick(handleCheckout);

        // Coupon input - use native event
        refs.coupon?.code?.oninput(({ event }) => {
            const code = (event.target as HTMLInputElement).value;
            setCoupon(patch(coupon(), [
                { op: REPLACE, path: ['code'], value: code }
            ]));
        });

        // Remove coupon button
        refs.coupon?.removeButton?.onclick(handleRemoveCoupon);
    });

    // Set up line item interactions
    createEffect(() => {
        const items = lineItems();
        items.forEach((item, index) => {
            // Quantity input change
            refs.lineItems?.quantity[index]?.oninput(({ event }) => {
                const newQty = parseInt((event.target as HTMLInputElement).value) || 1;
                handleQuantityChange(item.lineItemId, newQty);
            });

            // Decrement button
            refs.lineItems?.decrementButton[index]?.onclick(() => {
                if (item.quantity > 1) {
                    handleQuantityChange(item.lineItemId, item.quantity - 1);
                }
            });

            // Increment button
            refs.lineItems?.incrementButton[index]?.onclick(() => {
                handleQuantityChange(item.lineItemId, item.quantity + 1);
            });

            // Remove button
            refs.lineItems?.removeButton[index]?.onclick(() => {
                handleRemoveItem(item.lineItemId);
            });
        });
    });

    // Load cart on mount
    loadCart();

    return {
        render: () => ({
            isEmpty: isEmpty(),
            isLoading: isLoading(),
            isCheckingOut: isCheckingOut(),
            lineItems: lineItems(),
            summary: summary(),
            coupon: coupon()
        })
    };
}

// ============================================================================
// Component Export
// ============================================================================

/**
 * Cart Page Component
 *
 * Full shopping cart page with:
 * - Line item display with images, names, variants
 * - Quantity adjustment (increment/decrement/input)
 * - Item removal
 * - Cart summary (subtotal, discounts, total)
 * - Coupon code application
 * - Checkout button
 */
export const cartPage = makeJayStackComponent<CartPageContract>()
    .withProps<PageProps>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(CartPageInteractive);
