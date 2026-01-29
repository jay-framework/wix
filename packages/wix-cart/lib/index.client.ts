/**
 * Wix Cart Package - Client Entry Point
 * 
 * Client-side exports for cart functionality.
 */

// Export context for client-side usage
export { WIX_CART_CONTEXT } from './contexts/wix-cart-context';
export type { 
    WixCartContext, 
    ReactiveCartIndicator,
    CartOperationResult,
    AddToCartOptions
} from './contexts/wix-cart-context';

// Export cart helpers for client-side usage
export type {
    CartState,
    CartLineItem,
    CartSummary,
    CartIndicatorState,
} from './contexts/cart-helpers';

// Export components for client-side hydration
export * from './components/cart-indicator';
export * from './components/cart-page';

// Export init for client-side initialization
export { init } from './init.js';
