/**
 * Setup handler for wix-server-client plugin.
 *
 * Owns the full Wix credential flow:
 * - Interactive (human) mode: Wix CLI login, site connection, API key prompt
 * - Non-interactive (agent) mode: returns needs-config directing to --interactive
 *
 * Once configured, validates credentials in both modes.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';

const CONFIG_FILE_NAME = '.wix.yaml';

const GITIGNORE_ENTRIES = ['config/.wix.yaml', 'wix.config.json'];

function hasValidCredentials(configPath: string): {
    valid: boolean;
    apiKey: string;
    siteId: string;
    clientId: string;
} {
    if (!fs.existsSync(configPath)) {
        return { valid: false, apiKey: '', siteId: '', clientId: '' };
    }

    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = yaml.load(content) as Record<string, Record<string, string>> | null;
        if (!config) return { valid: false, apiKey: '', siteId: '', clientId: '' };

        const apiKey = config.apiKeyStrategy?.apiKey || '';
        const siteId = config.apiKeyStrategy?.siteId || '';
        const clientId = config.oauthStrategy?.clientId || '';

        const hasPlaceholders =
            apiKey.startsWith('<') || siteId.startsWith('<') || clientId.startsWith('<');
        const valid = !hasPlaceholders && !!apiKey && !!siteId;

        return { valid, apiKey, siteId, clientId };
    } catch {
        return { valid: false, apiKey: '', siteId: '', clientId: '' };
    }
}

function ensureGitignore(projectRoot: string): void {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        let content = fs.readFileSync(gitignorePath, 'utf-8');
        for (const entry of GITIGNORE_ENTRIES) {
            if (!content.includes(entry)) content += `\n${entry}`;
        }
        fs.writeFileSync(gitignorePath, content.trimEnd() + '\n', 'utf-8');
    }
}

function ensureWixLogin(projectRoot: string): void {
    try {
        execSync('npx @wix/cli whoami', { cwd: projectRoot, stdio: 'pipe' });
    } catch {
        execSync('npx @wix/cli login', { cwd: projectRoot, stdio: 'inherit' });
    }
}

function ensureWixSiteConnection(projectRoot: string): void {
    const wixConfigPath = path.join(projectRoot, 'wix.config.json');
    if (!fs.existsSync(wixConfigPath)) {
        execSync('npm create @wix/new@latest init', { cwd: projectRoot, stdio: 'inherit' });
    }
}

function readWixConfig(projectRoot: string): { appId: string; siteId: string } | null {
    const wixConfigPath = path.join(projectRoot, 'wix.config.json');
    if (!fs.existsSync(wixConfigPath)) return null;

    try {
        const config = JSON.parse(fs.readFileSync(wixConfigPath, 'utf-8'));
        return { appId: config.appId || '', siteId: config.siteId || '' };
    } catch {
        return null;
    }
}

export async function setupWixServerClient(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    const configPath = path.join(ctx.configDir, CONFIG_FILE_NAME);

    // Already configured with real values — validate connection
    const creds = hasValidCredentials(configPath);
    if (creds.valid) {
        if (ctx.initError) {
            return {
                status: 'error',
                message: `Credentials invalid or connection failed: ${ctx.initError.message}`,
            };
        }
        return {
            status: 'configured',
            message: `Wix client connected (site: ${creds.siteId.substring(0, 8)}...)`,
        };
    }

    // Wix login and site connection require a human at a TTY
    if (!ctx.interactive) {
        return {
            status: 'needs-config',
            message:
                'Wix login requires interactive mode. Run: jay-stack-cli setup --interactive',
        };
    }

    // Interactive (human): full credential flow
    ensureWixLogin(ctx.projectRoot);
    ensureWixSiteConnection(ctx.projectRoot);

    const wixConfig = readWixConfig(ctx.projectRoot);
    if (!wixConfig || !wixConfig.siteId || !wixConfig.appId) {
        return {
            status: 'needs-config',
            message: 'wix.config.json missing or incomplete — run setup again',
        };
    }

    const apiKey = await ctx.prompt.input({
        key: 'wix-api-key',
        message: 'Wix API Key (create at https://manage.wix.com/account/api-keys):',
        validate: (v) => v.trim().length > 0 || 'API key is required',
    });

    fs.mkdirSync(ctx.configDir, { recursive: true });
    fs.writeFileSync(
        configPath,
        yaml.dump({
            apiKeyStrategy: { apiKey: apiKey.trim(), siteId: wixConfig.siteId },
            oauthStrategy: { clientId: wixConfig.appId },
        }),
        'utf-8',
    );

    ensureGitignore(ctx.projectRoot);

    return {
        status: 'configured',
        configCreated: [`config/${CONFIG_FILE_NAME}`],
        message: `Wix client connected (site: ${wixConfig.siteId.substring(0, 8)}...)`,
    };
}
