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
export type { WixStoresServiceOptions } from './services/wix-stores-service.js';
export type { UrlTemplates, WixStoresConfig } from './config-loader.js';

// ============================================================================
// Plugin Initialization
// ============================================================================

export const init = makeJayInit()
    .withServer(async (): Promise<WixStoresInitData> => {
        console.log('[wix-stores] Initializing Wix Stores service...');

        const wixClient = getService(WIX_CLIENT_SERVICE);
        const storesConfig = loadWixStoresConfig();

        provideWixStoresService(wixClient, {
            urls: storesConfig.urls,
            defaultCategory: storesConfig.defaultCategory,
        });

        console.log(
            `[wix-stores] URL templates: product="${storesConfig.urls.product}", category="${storesConfig.urls.category ?? 'none'}"`,
        );
        if (storesConfig.defaultCategory) {
            console.log(`[wix-stores] Default category: ${storesConfig.defaultCategory}`);
        }

        console.log('[wix-stores] Server initialization complete');

        return {
            enableClientCart: true,
            enableClientSearch: true,
        };
    })
    .withClient(async (data: WixStoresInitData) => {
        console.log('[wix-stores] Initializing client-side stores context...');
        provideWixStoresContext();
        console.log('[wix-stores] Client initialization complete');
    });
