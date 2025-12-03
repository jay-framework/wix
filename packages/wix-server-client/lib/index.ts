import { createClient, ApiKeyStrategy, OAuthStrategy, WixClient } from "@wix/sdk";
import { loadConfig } from "./config-loader.js";

// Export config-related types and functions
export { loadConfig, type WixConfig } from "./config-loader.js";

let instance: WixClient = undefined;
export function getWixClient(): WixClient  {
    if (!instance) {
        const config = loadConfig();
        instance = createClient({
            auth: ApiKeyStrategy({
                apiKey: config.apiKey,
                siteId: config.siteId
            }),
            modules: {
            },
        })
    }
    return instance;
}