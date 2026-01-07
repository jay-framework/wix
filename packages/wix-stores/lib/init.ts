/**
 * Consolidated initialization for wix-stores plugin.
 *
 * Uses the makeJayInit pattern to define both server and client
 * initialization in a single file.
 *
 * Server: Registers the WixStoresService for server-side rendering.
 * Client: Provides WixStoresContext for client-side API access via OAuth authentication.
 */

import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';

import { provideWixStoresService } from './services/wix-stores-service.js';
import { provideWixStoresContext, type WixStoresInitData } from './contexts/wix-stores-context.js';

// Re-export types for consumers
export type { WixStoresInitData } from './contexts/wix-stores-context.js';

// ============================================================================
// Plugin Initialization
// ============================================================================

export const init = makeJayInit()
    .withServer(async (): Promise<WixStoresInitData> => {
        console.log('[wix-stores] Initializing Wix Stores service...');

        // Get the server-side Wix client (authenticated with API key)
        // The WIX_CLIENT_SERVICE is registered by the wix-server-client plugin
        const wixClient = getService(WIX_CLIENT_SERVICE);

        // Create and register the stores service
        provideWixStoresService(wixClient);

        console.log('[wix-stores] Server initialization complete');

        // Pass store configuration to the client
        return {
            enableClientCart: true,
            enableClientSearch: true,
        };
    })
    .withClient(async (data: WixStoresInitData) => {
        console.log('[wix-stores] Initializing client-side stores context...');

        const { enableClientCart, enableClientSearch } = data;

        // Register the Wix Stores context (uses WIX_CLIENT_CONTEXT internally)
        provideWixStoresContext();

        console.log('[wix-stores] Client initialization complete');
        console.log(`[wix-stores] Cart enabled: ${enableClientCart}, Search enabled: ${enableClientSearch}`);
    });
