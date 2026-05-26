import * as fs from 'fs';
import * as path from 'path';
import type {
    PluginSetupContext,
    PluginSetupResult,
    PluginReferencesContext,
    PluginReferencesResult,
} from '@jay-framework/stack-server-runtime';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_MEDIA_SERVICE_MARKER, type WixMediaService } from './services/wix-media-service.js';
import { generateMediaIndex } from './index-generator.js';

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
        getService(WIX_MEDIA_SERVICE_MARKER);
    } catch {
        return {
            status: 'error',
            message: 'WixMediaService not available. Check initialization.',
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

    let mediaService: WixMediaService;
    try {
        mediaService = getService(WIX_MEDIA_SERVICE_MARKER) as WixMediaService;
    } catch {
        throw new Error('WixMediaService not available. Run jay-stack setup first.');
    }

    fs.mkdirSync(ctx.referencesDir, { recursive: true });

    const files = await mediaService.listPublicFiles();

    const mediaIndexContent = generateMediaIndex(files);
    const mediaIndexPath = path.join(ctx.referencesDir, 'MEDIA-INDEX.md');
    fs.writeFileSync(mediaIndexPath, mediaIndexContent, 'utf-8');

    return {
        referencesCreated: [`agent-kit/references/${ctx.pluginName}/MEDIA-INDEX.md`],
        message: `${files.length} media files indexed.`,
    };
}
