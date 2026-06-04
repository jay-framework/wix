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

export const deploy = makeCliCommand('deploy')
    .withServices(WIX_CLIENT_SERVICE, CONSOLE_CONTEXT)
    .withHandler(async (input: DeployInput, wixClient: WixClientService, ctx: ConsoleContext) => {
        const dryRun = input.dryRun || false;

        ctx.log('=== Step 1: Bundle entry.mjs ===');
        const buildResult = await buildEntry.handler(
            {
                collectionId: input.collectionId,
                staticBaseUrl: input.staticBaseUrl,
                excludePlugins: input.excludePlugins,
            },
            ctx,
        );
        if (!buildResult?.success) {
            ctx.error('Build entry failed');
            return { success: false };
        }

        ctx.log('=== Step 2: Upload backend data + Deploy to BaaS (parallel) ===');
        const [uploadResult, deployResult] = await Promise.all([
            uploadBackend.handler({ collectionId: input.collectionId, dryRun }, wixClient, ctx),
            dryRun
                ? { success: true }
                : deployBaas.handler({ dryRun }, ctx),
        ]);

        if (!uploadResult?.success) ctx.error('Upload backend failed');
        if (!deployResult?.success) ctx.error('Deploy to BaaS failed');

        const success = !!(uploadResult?.success && deployResult?.success);
        ctx.log(success ? '=== Deploy complete ===' : '=== Deploy failed ===');
        return { success };
    });
