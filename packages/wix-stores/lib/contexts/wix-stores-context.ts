/**
 * Client-side Wix Stores Context
 * 
 * Provides access to Wix Stores APIs on the client using OAuth authentication.
 * This context mirrors the server-side WixStoresService structure.
 * 
 * Usage in interactive components:
 * ```typescript
 * const storesContext = useGlobalContext(WIX_STORES_CONTEXT);
 * const cart = await storesContext.cart.getCurrentCart();
 * ```
 */

import { createJayContext, registerGlobalContext, useGlobalContext } from '@jay-framework/runtime';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
import { 
    getProductsV3Client, 
    getCategoriesClient, 
    getInventoryClient, 
    getCurrentCartClient 
} from '../services/wix-store-api.js';

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
    /** Cart API client */
    cart: ReturnType<typeof getCurrentCartClient>;
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

    // Create and register the stores context
    const storesContext: WixStoresContext = {
        products: getProductsV3Client(wixClient),
        categories: getCategoriesClient(wixClient),
        inventory: getInventoryClient(wixClient),
        cart: getCurrentCartClient(wixClient),
    };
    
    registerGlobalContext(WIX_STORES_CONTEXT, storesContext);
    console.log('[wix-stores] Client stores context initialized');
}
