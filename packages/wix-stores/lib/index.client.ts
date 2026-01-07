/**
 * Wix Stores Package - Client Entry Point
 * 
 * This is the entry point for client-side imports.
 * Provides the context for direct API access and component definitions.
 */

// Export headless components
export * from './components/index.js';

// Export client context and types
export {
    WIX_STORES_CONTEXT,
    provideWixStoresContext,
    type WixStoresContext,
    type WixStoresInitData,
    type CartLineItem,
    type CartSummary,
    type CartState,
    type CartIndicatorState,
    mapLineItem,
    mapCartSummary,
    mapCartToState,
    mapCartToIndicator,
    getEmptyCartState,
} from './contexts/index.js';

// Note: Actions should be imported directly from '@jay-framework/wix-stores/actions'
// or from the specific action files. They are NOT re-exported here because the
// action transformer needs to intercept imports at the source file level.

// Export init
export { init } from './init.js';
