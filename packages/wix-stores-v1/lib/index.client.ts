/**
 * Wix Stores V1 Package - Client Entry Point
 * 
 * This is the entry point for client-side imports.
 * Provides the context for direct API access and component definitions.
 * 
 * Uses Wix Catalog V1 API (products module) instead of V3 (productsV3).
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
export * from './components/collection-page';
export * from './components/collection-list';

// Export stores V1 client context and types
export {
    WIX_STORES_V1_CONTEXT,
    provideWixStoresV1Context,
    type WixStoresV1Context,
    type WixStoresV1InitData,
    type ReactiveCartIndicator,
    type CartOperationResult,
} from './contexts/wix-stores-v1-context';

// Export init
export { init } from './init.js';
