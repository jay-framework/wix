/**
 * Wix Stores Package - Client Entry Point
 * 
 * This is the entry point for client-side imports.
 * Provides the context for direct API access and component definitions.
 */

// Re-export cart components from wix-cart (shared package)
export { cartIndicator, cartPage } from '@jay-framework/wix-cart/client';
export { WIX_CART_CONTEXT } from '@jay-framework/wix-cart/client';
export type { 
    WixCartContext,
    CartLineItem,
    CartSummary,
    CartState,
    CartIndicatorState,
} from '@jay-framework/wix-cart/client';

// Export stores-specific headless components
export * from './components/product-page';
export * from './components/product-search';
export * from './components/category-page';
export * from './components/category-list';

// Export stores client context and types
export {
    WIX_STORES_CONTEXT,
    provideWixStoresContext,
    type WixStoresContext,
    type WixStoresInitData,
    type ReactiveCartIndicator,
    type CartOperationResult,
} from './contexts/wix-stores-context';

// Note: Actions should be imported directly from '@jay-framework/wix-stores/actions'
// or from the specific action files. They are NOT re-exported here because the
// action transformer needs to intercept imports at the source file level.

// Export init
export { init } from './init.js';
