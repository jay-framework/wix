import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    PluginSetupContext,
    PluginSetupResult,
} from '@jay-framework/stack-server-runtime';

export async function setupWixMembers(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    const pagesDir = path.join(ctx.projectRoot, 'src', 'pages');
    const callbackPagePaths = [
        path.join(pagesDir, 'auth', 'callback', 'page.jay-html'),
        path.join(pagesDir, 'auth', 'callback.jay-html'),
    ];

    const hasCallbackPage = callbackPagePaths.some((p) => fs.existsSync(p));

    if (!hasCallbackPage) {
        return {
            status: 'needs-config',
            message:
                'Missing auth callback page. Create src/pages/auth/callback/page.jay-html using the auth-callback contract to handle the OAuth redirect.',
        };
    }

    return {
        status: 'configured',
        message: 'Wix Members configured (auth callback page found)',
    };
}
