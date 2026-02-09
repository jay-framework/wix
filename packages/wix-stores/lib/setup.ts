/**
 * Setup handler for wix-stores plugin (Design Log #87).
 *
 * Validates that wix-server-client is configured (no own config).
 * No references — product/category data is discoverable via
 * jay-stack action wix-stores/searchProducts and getCategories.
 */

import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_STORES_SERVICE_MARKER } from './services/wix-stores-service';

export async function setupWixStores(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    // wix-stores has no config of its own — depends on wix-server-client
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    // Verify the stores service is available
    try {
        getService(WIX_STORES_SERVICE_MARKER);
    } catch {
        return {
            status: 'error',
            message: 'WixStoresService not available. Run setup for wix-server-client first.',
        };
    }

    return {
        status: 'configured',
        message: 'Wix Stores service verified',
    };
}
