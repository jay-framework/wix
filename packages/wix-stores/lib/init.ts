/**
 * Consolidated initialization for wix-stores plugin.
 *
 * Uses the makeJayInit pattern to define both server and client
 * initialization in a single file.
 *
 * Server: Registers the WixStoresService for server-side rendering.
 * Client: Provides WixStoresContext for client-side API access.
 *
 * Note: Cart functionality is provided by the wix-cart plugin (dependency).
 * WIX_CART_SERVICE and WIX_CART_CONTEXT are initialized by wix-cart.
 */

import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';

import { provideWixStoresService } from './services/wix-stores-service';
import { provideWixStoresContext, type WixStoresInitData } from './contexts/wix-stores-context';
import { loadWixStoresConfig } from './config-loader';

// Re-export types for consumers
export type { WixStoresInitData } from './contexts/wix-stores-context.js';
export type {
    CategoryPrefixConfig,
    WixStoresServiceOptions,
} from './services/wix-stores-service.js';

// ============================================================================
// Plugin Initialization
// ============================================================================

export const init = makeJayInit()
    .withServer(async (): Promise<WixStoresInitData> => {
        console.log('[wix-stores] Initializing Wix Stores service...');

        // Get the server-side Wix client (authenticated with API key)
        const wixClient = getService(WIX_CLIENT_SERVICE);

        // Load optional config (config/.wix-stores.yaml)
        const storesConfig = loadWixStoresConfig();

        // Create and register the stores service (products, categories, inventory)
        // Note: Cart service is registered by wix-cart plugin
        provideWixStoresService(wixClient, {
            categoryPrefixes: storesConfig.categoryPrefixes,
        });

        if (storesConfig.categoryPrefixes.length > 0) {
            console.log(
                `[wix-stores] Category prefixes configured: ${storesConfig.categoryPrefixes.map((p) => p.prefix).join(', ')}`,
            );
        }

        console.log('[wix-stores] Server initialization complete');

        return {
            enableClientCart: true,
            enableClientSearch: true,
        };
    })
    .withClient(async (data: WixStoresInitData) => {
        console.log('[wix-stores] Initializing client-side stores context...');

        // Register the stores context (delegates cart operations to WIX_CART_CONTEXT)
        // Note: WIX_CART_CONTEXT is already initialized by wix-cart plugin
        provideWixStoresContext();

        console.log('[wix-stores] Client initialization complete');
        console.log(`[wix-stores] Search enabled: ${data.enableClientSearch}`);
    });
