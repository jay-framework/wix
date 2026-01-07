/**
 * Wix Stores Contexts
 * 
 * Client-side context for Wix Stores API access.
 */

export {
    WIX_STORES_CONTEXT,
    provideWixStoresContext,
    type WixStoresContext,
    type WixStoresInitData,
} from './wix-stores-context.js';

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
} from './cart-helpers.js';

