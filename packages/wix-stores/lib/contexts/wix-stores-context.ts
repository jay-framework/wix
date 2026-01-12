/**
 * Client-side Wix Stores Context
 * 
 * Provides access to Wix Stores APIs on the client using OAuth authentication.
 * This context mirrors the server-side WixStoresService structure.
 * 
 * Usage in interactive components:
 * ```typescript
 * const storesContext = useGlobalContext(WIX_STORES_CONTEXT);
 * const indicator = await storesContext.getCartIndicator();
 * const cartState = await storesContext.getEstimatedCart();
 * ```
 */

import { createJayContext, registerGlobalContext, useGlobalContext } from '@jay-framework/runtime';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
import { 
    getProductsV3Client, 
    getCategoriesClient, 
    getInventoryClient, 
    getCurrentCartClient 
} from '../utils/wix-store-api';
import { WixClient } from "@wix/sdk";
import {
    CartIndicatorState,
    CartState,
    getCurrentCartOrNull,
    estimateCurrentCartTotalsOrNull,
    mapCartToIndicator,
    mapEstimateTotalsToState
} from './cart-helpers';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration passed from server to client for Wix Stores.
 */
export interface WixStoresInitData {
    /** Enable client-side cart operations */
    enableClientCart: boolean;
    /** Enable client-side search */
    enableClientSearch: boolean;
}

/**
 * Client-side Wix Stores context interface.
 * Mirrors the server-side WixStoresService structure.
 */
export interface WixStoresContext {
    /** Products API client */
    products: ReturnType<typeof getProductsV3Client>;
    /** Categories API client */
    categories: ReturnType<typeof getCategoriesClient>;
    /** Inventory API client */
    inventory: ReturnType<typeof getInventoryClient>;
    /** Cart API client (raw Wix SDK client) */
    cart: ReturnType<typeof getCurrentCartClient>;
    /** Wix SDK client */
    wixClient: WixClient;
    
    // ========================================================================
    // Cart Helper APIs
    // ========================================================================
    
    /**
     * Get cart indicator data (item count and hasItems).
     * Handles 404 (no cart) as empty cart.
     * Use this for lightweight cart indicators in headers.
     */
    getCartIndicator(): Promise<CartIndicatorState>;
    
    /**
     * Get full cart state with estimated totals (subtotal, tax, total).
     * Handles 404 (no cart) as empty cart.
     * Use this for cart pages where accurate totals are needed.
     * @see https://dev.wix.com/docs/sdk/backend-modules/ecom/current-cart/estimate-current-cart-totals
     */
    getEstimatedCart(): Promise<CartState>;
}

/**
 * Context marker for client-side Wix Stores operations.
 */
export const WIX_STORES_CONTEXT = createJayContext<WixStoresContext>();

// ============================================================================
// Context Factory
// ============================================================================

/**
 * Initialize and register the Wix Stores client context.
 * Called during client-side initialization.
 * 
 * Assumes WIX_CLIENT_CONTEXT is already initialized with a valid client.
 */
export function provideWixStoresContext(): void {
    // Get the Wix client from wix-server-client plugin
    const wixClientContext = useGlobalContext(WIX_CLIENT_CONTEXT);
    const wixClient = wixClientContext.client;
    
    // Get cart client for helper functions
    const cartClient = getCurrentCartClient(wixClient);

    // Create and register the stores context
    const storesContext: WixStoresContext = {
        products: getProductsV3Client(wixClient),
        categories: getCategoriesClient(wixClient),
        inventory: getInventoryClient(wixClient),
        cart: cartClient,
        wixClient,
        
        // Cart helper APIs
        async getCartIndicator(): Promise<CartIndicatorState> {
            const cart = await getCurrentCartOrNull(cartClient);
            return mapCartToIndicator(cart);
        },
        
        async getEstimatedCart(): Promise<CartState> {
            const estimate = await estimateCurrentCartTotalsOrNull(cartClient);
            return mapEstimateTotalsToState(estimate);
        }
    };
    
    registerGlobalContext(WIX_STORES_CONTEXT, storesContext);
    console.log('[wix-stores] Client stores context initialized');
}
