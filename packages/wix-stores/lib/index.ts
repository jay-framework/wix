/**
 * Wix Stores Package - Server Entry Point
 * 
 * This is the main entry point for server-side imports.
 * Provides services, actions, and component definitions.
 */

// Export headless components
export * from './components/cart-page';
export * from './components/product-search';
export * from './components/product-page';
export * from './components/cart-indicator';

// Export server service
export {
    provideWixStoresService,
    WIX_STORES_SERVICE_MARKER,
    type WixStoresService,
} from './services/wix-stores-service';

// Export client context types (for type-only imports on server)
export {
    type CartLineItem,
    type CartSummary,
    type CartState,
    type CartIndicatorState,
} from './contexts/cart-helpers';
export {
    WIX_STORES_CONTEXT,
    type WixStoresContext,
    type WixStoresInitData,
} from './contexts/wix-stores-context';
// Export server actions (search, product browsing)
export * from './actions/stores-actions';

// Export init
export { init } from './init.js';
