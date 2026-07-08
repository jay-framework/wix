/**
 * Setup handler for wix-stores-v1 plugin.
 * Validates that the Wix Stores app is installed by querying products.
 */

import { getService } from '@jay-framework/stack-server-runtime';
import {
    WIX_STORES_V1_SERVICE_MARKER,
    type WixStoresV1Service,
} from './services/wix-stores-v1-service';
import { queryProducts } from './wix-apis/index.js';

interface PluginSetupContext {
    configDir: string;
    projectRoot: string;
    initError?: Error;
}

interface PluginSetupResult {
    status: 'configured' | 'needs-config' | 'error';
    message?: string;
}

export async function setupWixStoresV1(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    let service: WixStoresV1Service;
    try {
        service = getService(WIX_STORES_V1_SERVICE_MARKER) as WixStoresV1Service;
    } catch {
        return {
            status: 'error',
            message: 'WixStoresV1Service not available. Run setup for wix-server-client first.',
        };
    }

    try {
        await queryProducts(service.wixClient, { paging: { limit: 1 } });
    } catch (e: any) {
        const msg = e.message || '';
        const hint =
            msg.includes('404') || msg.includes('not found')
                ? 'Wix Stores may not be installed on this site'
                : msg.includes('403') || msg.includes('permission')
                  ? 'API key may lack Wix Stores permissions'
                  : 'This package requires the Stores Catalog V1 API — if using Catalog V3, use @jay-framework/wix-stores instead';
        return {
            status: 'error',
            message: `Wix Stores V1 API check failed: ${hint}. (${msg})`,
        };
    }

    return {
        status: 'configured',
        message: 'Wix Stores V1 connected',
    };
}
