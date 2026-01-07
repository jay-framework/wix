import { makeJayInit } from '@jay-framework/fullstack-component';
import { loadConfig } from './config-loader.js';
import {provideWixClientService} from "./wix-client-service";
import {provideWixClientContext} from "./wix-client-context";

// ============================================================================
// Plugin Initialization
// ============================================================================

export const init = makeJayInit()
    .withServer(async () => {
        console.log('[wix-server-client] Initializing Wix client configuration...');

        const config = loadConfig();
        provideWixClientService(config);

        return {
            oauthClientId: config.oauth.clientId,
        };
    })
    .withClient(async (data) => {
        // data is typed as WixClientInitData!
        console.log('[wix-server-client] Initializing client-side Wix client...');

        const { oauthClientId } = data;

        await provideWixClientContext(oauthClientId);

        console.log('[wix-server-client] Client initialization complete');
    });

