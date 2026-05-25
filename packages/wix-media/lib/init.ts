import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { provideWixMediaService } from './services/wix-media-service.js';

export const init = makeJayInit()
    .withServer(async () => {
        console.log('[wix-media] Initializing Wix Media service...');
        const wixClient = getService(WIX_CLIENT_SERVICE);
        provideWixMediaService(wixClient);
        console.log('[wix-media] Server initialization complete.');
        return {};
    })
    .withClient(async () => {});
