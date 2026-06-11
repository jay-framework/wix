import * as fs from 'fs';
import * as path from 'path';
import type {
    PluginSetupContext,
    PluginSetupResult,
    PluginReferencesContext,
    PluginReferencesResult,
} from '@jay-framework/stack-server-runtime';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { provideWixMediaService } from './services/wix-media-service.js';
import { generateMediaIndex } from './index-generator.js';

function createMediaService() {
    const wixClient = getService(WIX_CLIENT_SERVICE);
    return provideWixMediaService(wixClient);
}

export async function setupWixMedia(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'needs-config',
            message:
                'wix-media requires wix-server-client to be configured first. ' +
                'Run: jay-stack setup wix-server-client',
        };
    }

    try {
        createMediaService();
    } catch {
        return {
            status: 'needs-config',
            message:
                'wix-media requires wix-server-client to be configured first. ' +
                'Run: jay-stack setup wix-server-client',
        };
    }

    return {
        status: 'configured',
        message: 'Wix Media Manager access verified.',
    };
}

export async function generateWixMediaReferences(
    ctx: PluginReferencesContext,
): Promise<PluginReferencesResult> {
    if (ctx.initError) {
        throw new Error(`init failed: ${ctx.initError.message}`);
    }

    let mediaService;
    try {
        mediaService = createMediaService();
    } catch {
        throw new Error('WixMediaService not available. Run jay-stack setup first.');
    }

    fs.mkdirSync(ctx.referencesDir, { recursive: true });

    const mediaFiles = await mediaService.listPublicFiles();

    const mediaIndexContent = generateMediaIndex(mediaFiles);
    const mediaIndexPath = path.join(ctx.referencesDir, 'MEDIA-INDEX.md');
    fs.writeFileSync(mediaIndexPath, mediaIndexContent, 'utf-8');

    return {
        referencesCreated: [`agent-kit/references/${ctx.pluginName}/MEDIA-INDEX.md`],
        message: `${mediaFiles.length} media files indexed.`,
    };
}
