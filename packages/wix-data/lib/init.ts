/**
 * Consolidated initialization for wix-data plugin.
 *
 * Uses the makeJayInit pattern to define both server and client
 * initialization in a single file.
 *
 * Server: Registers the WixDataService for server-side rendering.
 * Client: Provides WixDataContext for client-side data access.
 */

import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { loadConfig } from './config-loader';
import { provideWixDataService } from './services/wix-data-service';
import { provideWixDataContext, type WixDataInitData } from './contexts/wix-data-context';

// Re-export types for consumers
export type { WixDataInitData } from './contexts/wix-data-context';

// ============================================================================
// Plugin Initialization
// ============================================================================

export const init = makeJayInit()
    .withServer(async (): Promise<WixDataInitData> => {
        console.log('[wix-data] Initializing Wix Data service...');

        // Get the server-side Wix client (authenticated with API key)
        const wixClient = getService(WIX_CLIENT_SERVICE);

        // Load plugin configuration (passes client to generate default config if needed)
        const config = await loadConfig(wixClient);

        // Create and register the data service
        provideWixDataService(wixClient, config);

        console.log(`[wix-data] Server initialization complete. ${config.collections.length} collections configured.`);

        // Pass collection info to the client
        return {
            collections: config.collections.map(c => c.collectionId)
        };
    })
    .withClient(async (data: WixDataInitData) => {
        console.log('[wix-data] Initializing client-side data context...');

        // Register the client-side context
        provideWixDataContext();

        console.log(`[wix-data] Client initialization complete. Collections: ${data.collections.join(', ')}`);
    });
