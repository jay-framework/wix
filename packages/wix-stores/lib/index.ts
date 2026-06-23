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
    provideWixCartContext,
} from '@jay-framework/wix-cart';
export type {
    WixCartService,
    WixCartContext,
    CartLineItem,
    CartSummary,
    CartState,
    CartIndicatorState,
    AddToCartOptions,
} from '@jay-framework/wix-cart';

// Export stores-specific headless components
export * from './components/product-search';
export * from './components/product-page';
export * from './components/category-products';
export * from './components/product-spotlight';
// category-page removed — use product-search with prefix/category params instead
export * from './components/category-list';

// Re-export param types from contracts (canonical source)
export type { ProductSearchParams } from './contracts/product-search.jay-contract';
export type { ProductPageParams } from './contracts/product-page.jay-contract';

// Export server service
export {
    provideWixStoresService,
    WIX_STORES_SERVICE_MARKER,
    type WixStoresService,
    type WixStoresServiceOptions,
} from './services/wix-stores-service';

// Export URL building and category utilities
export {
    buildProductUrl,
    buildCategoryUrl,
    findRootCategoryId,
    findRootCategorySlug,
    findCategoryImage,
    type CategoryTree,
} from './utils/product-mapper';

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

// Export setup handler (Design Log #87, #10)
export { setupWixStores, generateWixStoresReferences } from './setup.js';

// Export contract generators (Design Log #16)
export { generator as productPageContractGenerator } from './generators/product-page-contract-generator';
