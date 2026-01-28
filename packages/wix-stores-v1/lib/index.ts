/**
 * Wix Stores V1 Package - Server Entry Point
 * 
 * This is the main entry point for server-side imports.
 * Provides services, actions, and component definitions.
 * 
 * Uses Wix Catalog V1 API (products module) instead of V3 (productsV3).
 */

// Export server service
export {
    provideWixStoresV1Service,
    WIX_STORES_V1_SERVICE_MARKER,
    type WixStoresV1Service,
} from './services/wix-stores-v1-service';

// Export client context types (for type-only imports on server)
export {
    type CartLineItem,
    type CartSummary,
    type CartState,
    type CartIndicatorState,
} from './contexts/cart-helpers';
export {
    WIX_STORES_V1_CONTEXT,
    type WixStoresV1Context,
    type WixStoresV1InitData,
} from './contexts/wix-stores-v1-context';

// Export server actions
export * from './actions/stores-v1-actions';

// Export product mapper types
export type { V1Product, CollectionViewState } from './utils/product-mapper-v1';

// Export init
export { init } from './init.js';
