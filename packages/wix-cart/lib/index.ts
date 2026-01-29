/**
 * Wix Cart Package - Server Entry Point
 * 
 * Shared cart functionality for Wix Stores packages.
 */

// Export service
export { WIX_CART_SERVICE, provideWixCartService, getCurrentCartClient } from './services/wix-cart-service';
export type { WixCartService } from './services/wix-cart-service';

// Export context
export { WIX_CART_CONTEXT, provideWixCartContext } from './contexts/wix-cart-context';
export type { 
    WixCartContext, 
    WixCartInitData,
    ReactiveCartIndicator,
    CartOperationResult,
    AddToCartOptions
} from './contexts/wix-cart-context';

// Export cart helpers
export {
    mapLineItem,
    mapCartSummary,
    mapCartToState,
    mapCartToIndicator,
    getEmptyCartState,
    getCurrentCartOrNull,
    estimateCurrentCartTotalsOrNull,
    mapEstimateTotalsToState
} from './contexts/cart-helpers';
export type {
    CartState,
    CartLineItem,
    CartSummary,
    CartIndicatorState
} from './contexts/cart-helpers';

// Export components
export { cartIndicator } from './components/cart-indicator';
export { cartPage } from './components/cart-page';

// Export init
export { init } from './init';
