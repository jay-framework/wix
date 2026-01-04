import { createClient, ApiKeyStrategy, WixClient } from "@wix/sdk";
import { loadConfig } from "./config-loader.js";

// Export config-related types and functions
export { loadConfig, type WixConfig, type ApiKeyConfig, type OAuthConfig } from "./config-loader.js";

// Export init and client context
export { 
    init,
    WIX_CLIENT_CONTEXT, 
    type WixClientInitData,
    type WixClientContext,
} from './init.js';

let instance: WixClient = undefined;

/**
 * Get a server-side Wix client authenticated with API Key.
 * Use this for server-side operations (SSR, actions, etc.)
 */
export function getWixClient(): WixClient  {
    if (!instance) {
        const config = loadConfig();
        instance = createClient({
            auth: ApiKeyStrategy({
                apiKey: config.apiKey.apiKey,
                siteId: config.apiKey.siteId
            }),
            modules: {
            },
        })
    }
    return instance;
}

/**
 * Get the OAuth client ID for client-side authentication.
 * Returns undefined if OAuth is not configured.
 */
export function getOAuthClientId(): string | undefined {
    const config = loadConfig();
    return config.oauth?.clientId;
}
