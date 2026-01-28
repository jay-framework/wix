/**
 * Wix Stores V1 Package - Client Entry Point
 * 
 * This is the entry point for client-side imports.
 * Provides the context for direct API access.
 * 
 * Uses Wix Catalog V1 API (products module) instead of V3 (productsV3).
 */

// Export client context and types
export {
    WIX_STORES_V1_CONTEXT,
    provideWixStoresV1Context,
    type WixStoresV1Context,
    type WixStoresV1InitData,
    type ReactiveCartIndicator,
    type CartOperationResult,
} from './contexts/wix-stores-v1-context';

export {
    type CartLineItem,
    type CartSummary,
    type CartState,
    type CartIndicatorState,
    mapLineItem,
    mapCartSummary,
    mapCartToState,
    mapCartToIndicator,
    getEmptyCartState,
} from './contexts/cart-helpers';

// Export init
export { init } from './init.js';
