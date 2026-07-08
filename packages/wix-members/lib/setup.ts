import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';
import { loadWixMembersConfig } from './config-loader.js';

const CONFIG_FILE_NAME = '.wix-members.yaml';

const CONFIG_TEMPLATE = `# Wix Members Configuration
#
# Auth callback URL — the route that handles the OAuth redirect after login/register.
# Must match a page in your site (e.g. src/pages/auth/callback/page.jay-html).
# Relative paths are resolved against the site origin at runtime.
authCallbackUrl: "/auth/callback"
`;

export async function setupWixMembers(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    const configCreated: string[] = [];
    const configPath = path.join(ctx.configDir, CONFIG_FILE_NAME);

    if (!fs.existsSync(configPath)) {
        if (!fs.existsSync(ctx.configDir)) {
            fs.mkdirSync(ctx.configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
        configCreated.push(`config/${CONFIG_FILE_NAME}`);
    }

    const config = loadWixMembersConfig(ctx.projectRoot);

    const callbackUrl = config.authCallbackUrl;
    if (!callbackUrl.startsWith('/')) {
        return {
            status: 'configured',
            configCreated,
            message: `Wix Members configured (external callback: ${callbackUrl})`,
        };
    }

    const routeSegments = callbackUrl.replace(/^\//, '').split('/');
    const pagesDir = path.join(ctx.projectRoot, 'src', 'pages');
    const candidatePaths = [
        path.join(pagesDir, ...routeSegments, 'page.jay-html'),
        path.join(pagesDir, ...routeSegments.slice(0, -1), routeSegments.at(-1) + '.jay-html'),
    ];

    const hasCallbackPage = candidatePaths.some((p) => fs.existsSync(p));

    if (!hasCallbackPage) {
        const expectedPath = `src/pages/${routeSegments.join('/')}/page.jay-html`;
        return {
            status: 'needs-config',
            configCreated,
            message: `Auth callback page missing: create ${expectedPath} using the auth-callback contract. See agent-kit/plugin/wix-members-setup.md for details.`,
        };
    }

    return {
        status: 'configured',
        configCreated,
        message: `Wix Members configured (callback: ${callbackUrl})`,
    };
}
