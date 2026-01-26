/**
 * Wix Stores Package - Client Entry Point
 * 
 * This is the entry point for client-side imports.
 * Provides the context for direct API access and component definitions.
 */

// Export headless components
export * from './components/cart-page';
export * from './components/product-page';
export * from './components/cart-indicator';
export * from './components/product-search';
export * from './components/category-page';
export * from './components/category-list';

// Export client context and types
export {
    WIX_STORES_CONTEXT,
    provideWixStoresContext,
    type WixStoresContext,
    type WixStoresInitData,
    type ReactiveCartIndicator,
    type CartOperationResult,
} from './contexts/wix-stores-context';
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

// Note: Actions should be imported directly from '@jay-framework/wix-stores/actions'
// or from the specific action files. They are NOT re-exported here because the
// action transformer needs to intercept imports at the source file level.

// Export init
export { init } from './init.js';
