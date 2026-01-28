/**
 * Cart Page Component (V1)
 *
 * Full cart page with line item management, quantity updates, and checkout.
 * Uses the Wix eCommerce Cart API via client context.
 * 
 * Note: Cart operations are identical between V1 and V3 packages
 * as they both use @wix/ecom.
 */

import {
    makeJayStackComponent,
    RenderPipeline,
    Signals,
    PageProps
} from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import {
    CartPageContract,
    CartPageFastViewState,
    CartPageRefs,
    CartPageSlowViewState,
    LineItemOfCartPageViewState
} from '../contracts/cart-page.jay-contract';
import { WIX_STORES_V1_SERVICE_MARKER, WixStoresV1Service } from '../services/wix-stores-v1-service.js';
import {
    WIX_STORES_V1_CONTEXT, WixStoresV1Context,
} from '../contexts/wix-stores-v1-context';
import {
    CartState,
    CartLineItem,
} from '../contexts/cart-helpers';
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
    _wixStores: WixStoresV1Service
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
    _wixStores: WixStoresV1Service
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
    _carryForward: CartPageFastCarryForward,
    storesContext: WixStoresV1Context
) {

    // Get signal setters from viewStateSignals
    const {
        isEmpty: [isEmpty, setIsEmpty],
        isLoading: [isLoading, setIsLoading],
        isCheckingOut: [isCheckingOut, setIsCheckingOut],
        lineItems: [lineItems, setLineItems],
        summary: [summary, setSummary],
        coupon: [coupon, setCoupon]
    } = viewStateSignals;

    // Load cart data using context helper API (includes accurate totals)
    async function loadCart() {
        try {
            setIsLoading(true);
            const cartState = await storesContext.getEstimatedCart();
            const viewState = mapCartStateToViewState(cartState);
            
            setIsEmpty(viewState.isEmpty);
            setLineItems(viewState.lineItems);
            setSummary(viewState.summary);
            setCoupon(viewState.coupon);
        } catch (error) {
            console.error('[CartPage V1] Failed to load cart:', error);
        } finally {
            setIsLoading(false);
        }
    }

    // Handle quantity update
    async function handleQuantityChange(lineItemId: string, newQuantity: number) {
        const itemIndex = lineItems().findIndex(item => item.lineItemId === lineItemId);
        if (itemIndex === -1) return;

        setLineItems(patch(lineItems(), [
            { op: REPLACE, path: [itemIndex, 'isUpdatingQuantity'], value: true }
        ]));

        try {
            await storesContext.updateLineItemQuantity(lineItemId, newQuantity);
            await loadCart();
        } catch (error) {
            console.error('[CartPage V1] Failed to update quantity:', error);
            setLineItems(patch(lineItems(), [
                { op: REPLACE, path: [itemIndex, 'isUpdatingQuantity'], value: false }
            ]));
        }
    }

    // Handle item removal
    async function handleRemoveItem(lineItemId: string) {
        const itemIndex = lineItems().findIndex(item => item.lineItemId === lineItemId);
        if (itemIndex === -1) return;

        setLineItems(patch(lineItems(), [
            { op: REPLACE, path: [itemIndex, 'isRemoving'], value: true }
        ]));

        try {
            await storesContext.removeLineItems([lineItemId]);
            await loadCart();
        } catch (error) {
            console.error('[CartPage V1] Failed to remove item:', error);
            setLineItems(patch(lineItems(), [
                { op: REPLACE, path: [itemIndex, 'isRemoving'], value: false }
            ]));
        }
    }

    // Handle clear cart
    async function handleClearCart() {
        try {
            setIsLoading(true);
            await storesContext.clearCart();
            await loadCart();
        } catch (error) {
            console.error('[CartPage V1] Failed to clear cart:', error);
            setIsLoading(false);
        }
    }

    // Handle coupon application
    async function handleApplyCoupon() {
        const code = coupon().code.trim();
        if (!code) return;

        setCoupon(patch(coupon(), [
            { op: REPLACE, path: ['isApplying'], value: true },
            { op: REPLACE, path: ['hasError'], value: false },
            { op: REPLACE, path: ['errorMessage'], value: '' }
        ]));

        try {
            await storesContext.applyCoupon(code);
            await loadCart();
        } catch (error) {
            console.error('[CartPage V1] Failed to apply coupon:', error);
            setCoupon(patch(coupon(), [
                { op: REPLACE, path: ['isApplying'], value: false },
                { op: REPLACE, path: ['hasError'], value: true },
                { op: REPLACE, path: ['errorMessage'], value: 'Invalid coupon code' }
            ]));
        }
    }

    // Handle coupon removal
    async function handleRemoveCoupon() {
        try {
            await storesContext.removeCoupon();
            await loadCart();
        } catch (error) {
            console.error('[CartPage V1] Failed to remove coupon:', error);
        }
    }

    // Handle checkout
    async function handleCheckout() {
        setIsCheckingOut(true);
        window.location.href = '/checkout';
    }

    // Set up interactive refs
    refs.clearCartButton?.onclick(handleClearCart);
    refs.checkoutButton?.onclick(handleCheckout);

    refs.coupon?.code?.oninput(({ event }) => {
        const code = (event.target as HTMLInputElement).value;
        setCoupon(patch(coupon(), [
            { op: REPLACE, path: ['code'], value: code }
        ]));
    });

    refs.coupon?.applyButton?.onclick(handleApplyCoupon);
    refs.coupon?.removeButton?.onclick(handleRemoveCoupon);

    // Set up line item interactions
    refs.lineItems?.quantity.oninput(({ event, coordinate }) => {
        const lineItemId = coordinate[0];
        const newQty = parseInt((event.target as HTMLInputElement).value) || 1;
        handleQuantityChange(lineItemId, newQty);
    });

    refs.lineItems?.decrementButton.onclick(({ viewState }) => {
        if (viewState.quantity > 1) {
            handleQuantityChange(viewState.lineItemId, viewState.quantity - 1);
        }
    });

    refs.lineItems?.incrementButton.onclick(({ viewState }) => {
        handleQuantityChange(viewState.lineItemId, viewState.quantity + 1);
    });

    refs.lineItems?.removeButton.onclick(({ viewState }) => {
        handleRemoveItem(viewState.lineItemId);
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
 * Cart Page Component (V1)
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
    .withServices(WIX_STORES_V1_SERVICE_MARKER)
    .withContexts(WIX_STORES_V1_CONTEXT)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(CartPageInteractive);
