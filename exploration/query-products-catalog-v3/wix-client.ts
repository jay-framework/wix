import { createClient, ApiKeyStrategy, WixClient } from "@wix/sdk";
import { loadConfig } from "./config-loader.js";

let instance: WixClient | undefined = undefined;

export function getClient(): WixClient {
    if (!instance) {
        const config = loadConfig();
        instance = createClient({
            auth: ApiKeyStrategy({
                apiKey: config.apiKey,
                siteId: config.siteId
            }),
            modules: {},
        });
    }
    return instance;
}

