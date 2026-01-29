/**
 * Wix Stores Package - Server Entry Point
 * 
 * This is the main entry point for server-side imports.
 * Provides services, actions, and component definitions.
 */

// Re-export cart components from wix-cart (shared package)
export { cartIndicator, cartPage } from '@jay-framework/wix-cart';
export { 
    WIX_CART_SERVICE, 
    WIX_CART_CONTEXT,
    provideWixCartService,
    provideWixCartContext
} from '@jay-framework/wix-cart';
export type { 
    WixCartService, 
    WixCartContext,
    CartLineItem,
    CartSummary,
    CartState,
    CartIndicatorState,
    AddToCartOptions
} from '@jay-framework/wix-cart';

// Export stores-specific headless components
export * from './components/product-search';
export * from './components/product-page';
export * from './components/category-page';
export * from './components/category-list';

// Export server service
export {
    provideWixStoresService,
    WIX_STORES_SERVICE_MARKER,
    type WixStoresService,
} from './services/wix-stores-service';

// Export stores client context 
export {
    WIX_STORES_CONTEXT,
    type WixStoresContext,
    type WixStoresInitData,
} from './contexts/wix-stores-context';

// Export server actions (search, product browsing)
export * from './actions/stores-actions';

// Export init
export { init } from './init.js';
