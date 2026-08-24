import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';

export const init = makeJayInit()
    .withServer(async () => {
        console.log('[wix-forms] Initializing server-side forms service...');
        const { loadWixFormsConfig } = await import('./config-loader.js');
        const { provideWixFormsService } = await import('./services/wix-forms-service.js');
        const wixClient = getService(WIX_CLIENT_SERVICE);
        const config = loadWixFormsConfig(process.cwd());
        provideWixFormsService(wixClient, config);
        if (config.defaultContactFormId) {
            console.log(`[wix-forms] Default contact form: ${config.defaultContactFormId}`);
        }
        console.log('[wix-forms] Server initialization complete');
        return {};
    })
    .withClient(async () => {
        console.log('[wix-forms] Client ready');
    });
