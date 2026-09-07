import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { provideWixFormsService } from './services/wix-forms-service.js';
import { buildSiteFormsCatalog } from './site-forms-catalog.js';

export const init = makeJayInit()
    .withServer(async () => {
        console.log('[wix-forms] Initializing server-side forms service...');
        const wixClient = getService(WIX_CLIENT_SERVICE);
        const catalog = await buildSiteFormsCatalog(wixClient);
        provideWixFormsService(wixClient, catalog);
        console.log(`[wix-forms] Site forms discovered: ${catalog.forms.length}`);
        for (const entry of catalog.forms) {
            console.log(`[wix-forms]   form/${entry.contractSlug} → ${entry.title} (${entry.formId})`);
        }
        console.log('[wix-forms] Server initialization complete');
        return {};
    })
    .withClient(async () => {
        console.log('[wix-forms] Client ready');
    });
