import * as fs from 'fs';
import * as path from 'path';
import type { WixClient } from '@wix/sdk';
import type {
    PluginSetupContext,
    PluginSetupResult,
    PluginAgentKitContext,
    PluginAgentKitResult,
} from '@jay-framework/stack-server-runtime';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { provideWixMediaService } from './services/wix-media-service.js';
import { generateMediaIndex } from './index-generator.js';
import { buildMediaAddMenuItems } from './add-menu/media-items.js';
import { writeGeneratedAddMenuCatalog } from './add-menu/write-add-menu-catalog.js';

function getWixClient(services: Map<symbol, unknown>): WixClient {
    const fromContext = services.get(WIX_CLIENT_SERVICE as symbol);
    if (fromContext !== undefined) {
        return fromContext as WixClient;
    }

    return getService(WIX_CLIENT_SERVICE) as unknown as WixClient;
}

function createMediaService(services: Map<symbol, unknown>) {
    return provideWixMediaService(getWixClient(services));
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
        createMediaService(ctx.services);
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

export async function generateWixMediaAgentKit(
    ctx: PluginAgentKitContext,
): Promise<PluginAgentKitResult> {
    if (ctx.initError) {
        throw new Error(`init failed: ${ctx.initError.message}`);
    }

    let mediaService;
    try {
        mediaService = createMediaService(ctx.services);
    } catch {
        throw new Error('WixMediaService not available. Run jay-stack setup first.');
    }

    fs.mkdirSync(ctx.referencesDir, { recursive: true });

    const mediaFiles = await mediaService.listPublicFiles();

    const mediaIndexContent = generateMediaIndex(mediaFiles);
    const mediaIndexPath = path.join(ctx.referencesDir, 'MEDIA-INDEX.md');
    fs.writeFileSync(mediaIndexPath, mediaIndexContent, 'utf-8');

    const addMenuItems = buildMediaAddMenuItems(mediaFiles);
    const addMenuGenerated = writeGeneratedAddMenuCatalog(ctx.projectRoot, addMenuItems);

    return {
        agentKitCreated: [
            `agent-kit/references/${ctx.pluginName}/MEDIA-INDEX.md`,
            addMenuGenerated,
        ],
        message: `${mediaFiles.length} media files indexed; ${addMenuItems.length} Add Menu items.`,
    };
}
