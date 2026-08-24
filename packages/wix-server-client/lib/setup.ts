/**
 * Setup handler for wix-server-client plugin.
 *
 * Automates the full Wix credential flow:
 * 1. Wix CLI login + site connection (creates wix.config.json with appId)
 * 2. Fetches appSecret from Dev Center API automatically
 * 3. Writes .wix.yaml with appStrategy — no manual credential entry needed
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';

const CONFIG_FILE_NAME = '.wix.yaml';

const GITIGNORE_ENTRIES = ['config/.wix.yaml', 'wix.config.json'];

type CredentialCheck =
    | { valid: false }
    | { valid: true; strategy: 'apiKey'; siteId: string }
    | { valid: true; strategy: 'app'; appId: string };

function hasValidCredentials(configPath: string): CredentialCheck {
    if (!fs.existsSync(configPath)) {
        return { valid: false };
    }

    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = yaml.load(content) as Record<string, Record<string, string>> | null;
        if (!config) return { valid: false };

        const clientId = config.oauthStrategy?.clientId || '';
        if (!clientId || clientId.startsWith('<')) return { valid: false };

        if (config.apiKeyStrategy) {
            const apiKey = config.apiKeyStrategy.apiKey || '';
            const siteId = config.apiKeyStrategy.siteId || '';
            if (!apiKey || !siteId || apiKey.startsWith('<') || siteId.startsWith('<')) {
                return { valid: false };
            }
            return { valid: true, strategy: 'apiKey', siteId };
        }

        if (config.appStrategy) {
            const appId = config.appStrategy.appId || '';
            const appSecret = config.appStrategy.appSecret || '';
            if (!appId || !appSecret || appId.startsWith('<') || appSecret.startsWith('<')) {
                return { valid: false };
            }
            return { valid: true, strategy: 'app', appId };
        }

        return { valid: false };
    } catch {
        return { valid: false };
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
        execSync('npx @wix/cli@latest whoami', { cwd: projectRoot, stdio: 'pipe' });
    } catch {
        execSync('npx @wix/cli@latest login', { cwd: projectRoot, stdio: 'inherit' });
    }
}

function getWixToken(projectRoot: string): string {
    const token = execSync('npx @wix/cli@latest token', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!token) {
        throw new Error('Empty token from wix cli. Are you logged in?');
    }
    return token;
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

async function fetchAppSecret(
    token: string,
    appId: string,
): Promise<{ appSecret: string; webhookPublicKey: string }> {
    const url = `https://manage.wix.com/apps-service/v1/apps/${appId}?withSecrets=true`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: token,
            'X-XSRF-TOKEN': 'nocheck',
            Cookie: 'XSRF-TOKEN=nocheck',
        },
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Dev Center API failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
        app?: { appSecrets?: { appSecret: string; webhookPublicKey: string } };
    };

    if (!data.app?.appSecrets?.appSecret) {
        throw new Error('Dev Center response did not include appSecret');
    }

    return data.app.appSecrets;
}

export async function setupWixServerClient(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    const configPath = path.join(ctx.configDir, CONFIG_FILE_NAME);

    const creds = hasValidCredentials(configPath);
    if (creds.valid) {
        if (ctx.initError) {
            return {
                status: 'error',
                message: `Credentials invalid or connection failed: ${ctx.initError.message}`,
            };
        }
        const summary =
            creds.strategy === 'apiKey'
                ? `site: ${creds.siteId.substring(0, 8)}...`
                : `app: ${creds.appId.substring(0, 8)}...`;
        return {
            status: 'configured',
            message: `Wix client connected (${summary})`,
        };
    }

    // Wix login requires a TTY for the browser-based OAuth flow
    if (!ctx.interactive) {
        return {
            status: 'needs-config',
            message: 'Wix login requires interactive mode. Run: jay-stack-cli setup --interactive',
        };
    }

    ensureWixLogin(ctx.projectRoot);
    ensureWixSiteConnection(ctx.projectRoot);

    const wixConfig = readWixConfig(ctx.projectRoot);
    if (!wixConfig || !wixConfig.siteId || !wixConfig.appId) {
        return {
            status: 'needs-config',
            message: 'wix.config.json missing or incomplete — run setup again',
        };
    }

    const token = getWixToken(ctx.projectRoot);
    const { appSecret } = await fetchAppSecret(token, wixConfig.appId);

    const configData = {
        appStrategy: { appId: wixConfig.appId, appSecret },
        oauthStrategy: { clientId: wixConfig.appId },
    };

    fs.mkdirSync(ctx.configDir, { recursive: true });
    fs.writeFileSync(configPath, yaml.dump(configData), 'utf-8');

    ensureGitignore(ctx.projectRoot);

    return {
        status: 'configured',
        configCreated: [`config/${CONFIG_FILE_NAME}`],
        message: `Wix client connected (app: ${wixConfig.appId.substring(0, 8)}...)`,
    };
}
