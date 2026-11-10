import { hasService } from '@jay-framework/stack-server-runtime';
import type { PluginSetupResult } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from './wix-client-service.js';

export const SERVER_CLIENT_NOT_CONFIGURED_MESSAGE =
    'skipped: wix-server-client not configured. Run setup for wix-server-client first.';

/**
 * For a dependent wix plugin's setup: the result to return when it cannot run yet. Without a
 * registered Wix client the plugin's own init fails with "Service … not found", which is
 * only a symptom — report the real cause instead. Undefined when setup can proceed.
 */
export function serverClientSetupBlocker(initError?: Error): PluginSetupResult | undefined {
    if (!hasService(WIX_CLIENT_SERVICE)) {
        return { status: 'needs-config', message: SERVER_CLIENT_NOT_CONFIGURED_MESSAGE };
    }
    if (initError) {
        return { status: 'error', message: `Service init failed: ${initError.message}` };
    }
    return undefined;
}
