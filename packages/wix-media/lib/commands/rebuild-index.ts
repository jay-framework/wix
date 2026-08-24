import { makeCliCommand, CONSOLE_CONTEXT } from '@jay-framework/fullstack-component';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { provideWixMediaService } from '../services/wix-media-service.js';
import { refreshMediaProjectCatalog } from '../catalog/refresh-media-project-catalog.js';

export const rebuildIndex = makeCliCommand('rebuild-index')
    .withServices(CONSOLE_CONTEXT, WIX_CLIENT_SERVICE)
    .withHandler(async (_input: {}, console, wixClientService) => {
        const wixClient =
            typeof wixClientService === 'object' &&
            wixClientService !== null &&
            'wixClient' in wixClientService &&
            wixClientService.wixClient
                ? wixClientService.wixClient
                : (wixClientService as unknown as import('@wix/sdk').WixClient);
        const mediaService = provideWixMediaService(wixClient);

        console.log('Fetching media from Wix Media Manager...');
        const result = await refreshMediaProjectCatalog(console.projectRoot, mediaService);
        console.log(`Found ${result.itemCount} public media files.`);
        console.log(`Media index written to ${result.indexRel}`);
        console.log(`Add Menu catalog written to ${result.outputRel}`);
        return {
            success: true,
            fileCount: result.itemCount,
            addMenuPath: result.outputRel,
        };
    });
