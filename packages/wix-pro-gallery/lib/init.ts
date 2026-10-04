import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { provideWixProGalleryService } from './services/pro-gallery-service.js';

export const init = makeJayInit().withServer(async () => {
    provideWixProGalleryService(getService(WIX_CLIENT_SERVICE));
    return {};
});
