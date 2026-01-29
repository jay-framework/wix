/**
 * Consolidated initialization for wix-stores-v1 plugin.
 *
 * Uses the makeJayInit pattern to define both server and client
 * initialization in a single file.
 *
 * Server: Registers the WixStoresV1Service for server-side rendering.
 * Client: Provides WixStoresV1Context for client-side API access.
 * 
 * Note: Cart functionality is provided by the wix-cart plugin (dependency).
 * WIX_CART_SERVICE and WIX_CART_CONTEXT are initialized by wix-cart.
 */

import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';

import { provideWixStoresV1Service } from './services/wix-stores-v1-service';
import { provideWixStoresV1Context, type WixStoresV1InitData } from './contexts/wix-stores-v1-context';

// Re-export types for consumers
export type { WixStoresV1InitData } from './contexts/wix-stores-v1-context.js';

// ============================================================================
// Plugin Initialization
// ============================================================================

export const init = makeJayInit()
    .withServer(async (): Promise<WixStoresV1InitData> => {
        console.log('[wix-stores-v1] Initializing Wix Stores V1 service...');

        // Get the server-side Wix client (authenticated with API key)
        const wixClient = getService(WIX_CLIENT_SERVICE);

        // Create and register the stores V1 service (products, collections, inventory)
        // Note: Cart service is registered by wix-cart plugin
        provideWixStoresV1Service(wixClient);

        console.log('[wix-stores-v1] Server initialization complete');

        return {
            enableClientCart: true,
            enableClientSearch: true,
        };
    })
    .withClient(async (data: WixStoresV1InitData) => {
        console.log('[wix-stores-v1] Initializing client-side stores context...');

        // Register the stores V1 context (delegates cart operations to WIX_CART_CONTEXT)
        // Note: WIX_CART_CONTEXT is already initialized by wix-cart plugin
        provideWixStoresV1Context();

        console.log('[wix-stores-v1] Client initialization complete');
        console.log(`[wix-stores-v1] Search enabled: ${data.enableClientSearch}`);
    });
