/**
 * jay-stack run wix-deploy/deploy
 *
 * Single command that replaces the 3-step deploy sequence:
 *   1. build-entry (bundle entry.mjs)
 *   2. upload-backend (data collection) — parallel with step 3
 *   3. deploy-baas (BaaS + CDN) — parallel with step 2
 */

import { makeCliCommand, CONSOLE_CONTEXT } from '@jay-framework/fullstack-component';
import type { ConsoleContext } from '@jay-framework/fullstack-component';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import type { WixClientService } from '@jay-framework/wix-server-client';
import { buildEntry } from './build-entry.js';
import { uploadBackend } from './upload-backend.js';
import { deployBaas } from './deploy-baas.js';

interface DeployInput {
    collectionId?: string;
    staticBaseUrl?: string;
    excludePlugins?: string;
    dryRun?: boolean;
}

function silentCtx(ctx: ConsoleContext): ConsoleContext {
    return { ...ctx, log: () => {}, warn: () => {} };
}

function prefixCtx(ctx: ConsoleContext, prefix: string): ConsoleContext {
    return { ...ctx, log: (msg: string) => ctx.log(`[deploy]   ${prefix} ${msg}`), warn: () => {} };
}

export const deploy = makeCliCommand('deploy')
    .withServices(WIX_CLIENT_SERVICE, CONSOLE_CONTEXT)
    .withHandler(async (input: DeployInput, wixClient: WixClientService, ctx: ConsoleContext) => {
        const dryRun = input.dryRun || false;
        const t0 = Date.now();

        ctx.log('[deploy] Bundling entry.mjs...');
        const buildResult = (await buildEntry.handler(
            {
                collectionId: input.collectionId,
                staticBaseUrl: input.staticBaseUrl,
                excludePlugins: input.excludePlugins,
            },
            silentCtx(ctx),
        )) as any;
        if (!buildResult?.success) {
            ctx.error('[deploy] Bundle failed');
            return { success: false };
        }
        const bundleTime = ((Date.now() - t0) / 1000).toFixed(1);
        ctx.log(`[deploy] Bundled entry.mjs (${buildResult.sizeMB} MB) in ${bundleTime}s`);

        ctx.log('[deploy] Uploading...');
        const t1 = Date.now();

        const [uploadResult, deployResult] = (await Promise.all([
            uploadBackend.handler(
                { collectionId: input.collectionId, dryRun },
                wixClient,
                prefixCtx(ctx, 'data |'),
            ),
            dryRun
                ? { success: true, baseUrl: '(dry run)' }
                : deployBaas.handler({ dryRun }, prefixCtx(ctx, 'baas |')),
        ])) as [any, any];

        if (!uploadResult?.success) ctx.error('[deploy] Backend data upload failed');
        if (!deployResult?.success) ctx.error('[deploy] BaaS deployment failed');

        const success = !!(uploadResult?.success && deployResult?.success);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const deployTime = ((Date.now() - t1) / 1000).toFixed(1);

        ctx.log('');
        if (success) {
            ctx.log(`[deploy] Done in ${elapsed}s (bundle ${bundleTime}s + deploy ${deployTime}s)`);
            ctx.log(`[deploy] Entry: ${buildResult.sizeMB} MB | Backend files: ${uploadResult.uploaded}`);
            if (deployResult.baseUrl) {
                ctx.log(`[deploy] URL: ${deployResult.baseUrl}`);
            }
        } else {
            ctx.log(`[deploy] Failed after ${elapsed}s`);
        }

        return { success, ...deployResult };
    });
