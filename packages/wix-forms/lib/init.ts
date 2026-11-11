import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { loadWixFormsConfig } from './config-loader.js';
import { provideWixFormsService } from './services/wix-forms-service.js';
import { provideWixFormsContext } from './contexts/wix-forms-context.js';

export const init = makeJayInit()
    .withServer(async () => {
        console.log('[wix-forms] Initializing server-side forms service...');
        const wixClient = getService(WIX_CLIENT_SERVICE);
        const config = loadWixFormsConfig(process.cwd());
        provideWixFormsService(wixClient, config);
        console.log(`[wix-forms] Forms namespace: ${config.namespace}`);
        console.log('[wix-forms] Server initialization complete');
        return {};
    })
    .withClient(async () => {
        // The page-code channel for page checks (DL#53 G1); created here once, never lazily.
        provideWixFormsContext();
        console.log('[wix-forms] Client ready');
    });
