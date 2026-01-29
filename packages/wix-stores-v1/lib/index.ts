/**
 * Wix Stores V1 Package - Server Entry Point
 * 
 * This is the main entry point for server-side imports.
 * Provides services, actions, and component definitions.
 * 
 * Uses Wix Catalog V1 API (products module) instead of V3 (productsV3).
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

// Export server service
export {
    provideWixStoresV1Service,
    WIX_STORES_V1_SERVICE_MARKER,
    type WixStoresV1Service,
} from './services/wix-stores-v1-service';

// Export stores V1 client context 
export {
    WIX_STORES_V1_CONTEXT,
    type WixStoresV1Context,
    type WixStoresV1InitData,
} from './contexts/wix-stores-v1-context';

// Export server actions
export * from './actions/stores-v1-actions';

// Export product mapper types
export type { V1Collection, CollectionViewState } from './utils/product-mapper-v1';

// Export stores-specific components
export { productPage, type ProductPageParams } from './components/product-page';
export { productSearch } from './components/product-search';
export { collectionList, categoryList } from './components/collection-list';
export { collectionPage, categoryPage, type CollectionPageParams } from './components/collection-page';

// Export init
export { init } from './init.js';
