import { makeJayQuery } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { provideWixMediaService } from './services/wix-media-service.js';
import { refreshMediaAddMenuCatalog } from './add-menu/refresh-media-add-menu.js';

export const getMediaSettingsStatus = makeJayQuery('wixMedia.getMediaSettingsStatus').withHandler(
    async () => {
        try {
            const wixClient = getService(WIX_CLIENT_SERVICE);
            const mediaService = provideWixMediaService(wixClient);
            const files = await mediaService.listPublicFiles();
            return {
                connected: true,
                fileCount: files.length,
                message: `Connected to Wix Media Manager (${files.length} public files).`,
            };
        } catch (error) {
            return {
                connected: false,
                fileCount: 0,
                message:
                    error instanceof Error
                        ? error.message
                        : 'Wix Media Manager is not available. Configure wix-server-client first.',
            };
        }
    },
);

export const rebuildMediaCatalog = makeJayQuery('wixMedia.rebuildMediaCatalog').withHandler(
    async () => {
        const projectRoot = process.cwd();
        const wixClient = getService(WIX_CLIENT_SERVICE);
        const mediaService = provideWixMediaService(wixClient);
        const result = await refreshMediaAddMenuCatalog(projectRoot, mediaService);
        return result;
    },
);
