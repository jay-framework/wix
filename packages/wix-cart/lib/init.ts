/**
 * Consolidated initialization for wix-cart plugin.
 *
 * Uses the makeJayInit pattern to define both server and client
 * initialization in a single file.
 *
 * Server: Registers the WixCartService for server-side rendering.
 * Client: Provides WixCartContext for client-side cart operations via OAuth authentication.
 */

import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';

import { provideWixCartService } from './services/wix-cart-service';
import { provideWixCartContext, type WixCartInitData } from './contexts/wix-cart-context';

// Re-export types for consumers
export type { WixCartInitData } from './contexts/wix-cart-context.js';

// ============================================================================
// Plugin Initialization
// ============================================================================

export const init = makeJayInit()
    .withServer(async (): Promise<WixCartInitData> => {
        console.log('[wix-cart] Initializing Wix Cart service...');

        // Get the server-side Wix client (authenticated with API key)
        const wixClient = getService(WIX_CLIENT_SERVICE);

        // Create and register the cart service
        provideWixCartService(wixClient);

        console.log('[wix-cart] Server initialization complete');

        return {
            enableClientCart: true,
        };
    })
    .withClient(async (data: WixCartInitData) => {
        console.log('[wix-cart] Initializing client-side cart context...');

        const { enableClientCart } = data;

        // Register the reactive Wix Cart context
        const cartContext = provideWixCartContext();
        
        // Load initial cart indicator state
        if (enableClientCart) {
            await cartContext.refreshCartIndicator();
        }

        console.log('[wix-cart] Client initialization complete');
        console.log(`[wix-cart] Cart enabled: ${enableClientCart}`);
    });
