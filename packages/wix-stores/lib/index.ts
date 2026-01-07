/**
 * Wix Stores Package - Server Entry Point
 * 
 * This is the main entry point for server-side imports.
 * Provides services, actions, and component definitions.
 */

// Export headless components
export * from './components/index.js';

// Export server service
export {
    provideWixStoresService,
    WIX_STORES_SERVICE_MARKER,
    type WixStoresService,
} from './services/index.js';

// Export client context types (for type-only imports on server)
export {
    WIX_STORES_CONTEXT,
    type WixStoresContext,
    type WixStoresInitData,
    type CartLineItem,
    type CartSummary,
    type CartState,
    type CartIndicatorState,
} from './contexts/index.js';

// Export server actions (search, product browsing)
export * from './actions/index.js';

// Export init
export { init } from './init.js';
