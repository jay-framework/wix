/**
 * Consolidated initialization for wix-stores-v1 plugin.
 *
 * Uses the makeJayInit pattern to define both server and client
 * initialization in a single file.
 *
 * Server: Registers the WixStoresV1Service for server-side rendering.
 * Client: Provides WixStoresV1Context for client-side API access via OAuth authentication.
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

        // Create and register the stores V1 service
        provideWixStoresV1Service(wixClient);

        console.log('[wix-stores-v1] Server initialization complete');

        // Pass store configuration to the client
        return {
            enableClientCart: true,
            enableClientSearch: true,
        };
    })
    .withClient(async (data: WixStoresV1InitData) => {
        console.log('[wix-stores-v1] Initializing client-side stores context...');

        const { enableClientCart, enableClientSearch } = data;

        // Register the reactive Wix Stores V1 context
        const storesContext = provideWixStoresV1Context();
        
        // Load initial cart indicator state
        if (enableClientCart) {
            await storesContext.refreshCartIndicator();
        }

        console.log('[wix-stores-v1] Client initialization complete');
        console.log(`[wix-stores-v1] Cart enabled: ${enableClientCart}, Search enabled: ${enableClientSearch}`);
    });
