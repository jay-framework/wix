/**
 * Setup handler for wix-server-client plugin.
 *
 * Automates the full Wix credential flow:
 * 1. Wix CLI login + site connection (creates wix.config.json with appId)
 * 2. Fetches appSecret from Dev Center API automatically
 * 3. Finds the app's instance on the site (the token scope, DL #54)
 * 4. Writes .wix.yaml with appStrategy — no manual credential entry needed
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { readWixConfig } from './wix-config-file.js';
import { ensureWixLogin, getWixToken, listSiteAppInstances } from './wix-cli.js';
import { loadConfigFrom } from './config-loader.js';
import { verifyServerAuth } from './server-auth.js';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';

const CONFIG_FILE_NAME = '.wix.yaml';

const GITIGNORE_ENTRIES = ['config/.wix.yaml', 'wix.config.json'];

type CredentialCheck =
    | { valid: false; unreadable?: string; missingAppFields?: string[] }
    | { valid: true; strategy: 'apiKey'; siteId: string }
    | { valid: true; strategy: 'app'; appId: string };

function hasValidCredentials(configPath: string): CredentialCheck {
    if (!fs.existsSync(configPath)) {
        return { valid: false };
    }

    let config: Record<string, Record<string, string>> | null;
    try {
        config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as typeof config;
    } catch (error) {
        return { valid: false, unreadable: error instanceof Error ? error.message : String(error) };
    }
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
        const appStrategy = config.appStrategy;
        const missingAppFields = ['appId', 'appSecret', 'siteId', 'instanceId'].filter((field) => {
            const value = appStrategy[field] || '';
            return !value || value.startsWith('<');
        });
        if (missingAppFields.length > 0) return { valid: false, missingAppFields };
        return { valid: true, strategy: 'app', appId: appStrategy.appId };
    }

    return { valid: false };
}

/** The setup result once credentials exist: connected only if they can actually authenticate. */
async function connectionResult(
    configPath: string,
    summary: string,
    extra: Partial<PluginSetupResult> = {},
): Promise<PluginSetupResult> {
    try {
        await verifyServerAuth(loadConfigFrom(configPath));
    } catch (error) {
        return {
            status: 'error',
            message: `${configPath}: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    return { status: 'configured', ...extra, message: `Wix client connected (${summary})` };
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

function ensureWixSiteConnection(projectRoot: string): void {
    const wixConfigPath = path.join(projectRoot, 'wix.config.json');
    if (!fs.existsSync(wixConfigPath)) {
        execSync('npm create @wix/new@latest init', { cwd: projectRoot, stdio: 'inherit' });
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

/** The instance id of `appId` on the site `siteToken` is scoped to. */
async function fetchAppInstanceId(siteToken: string, appId: string): Promise<string> {
    const instance = (await listSiteAppInstances(siteToken)).find((app) => app.appDefId === appId);
    if (!instance) {
        throw new Error(`App ${appId} is not installed on the site in wix.config.json`);
    }
    return instance.id;
}

export async function setupWixServerClient(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    const configPath = path.join(ctx.configDir, CONFIG_FILE_NAME);

    const creds = hasValidCredentials(configPath);
    if (!creds.valid && 'unreadable' in creds && creds.unreadable) {
        return {
            status: 'error',
            message: `${configPath} could not be parsed: ${creds.unreadable}. Fix the YAML (or move the file away to start over) and run setup again.`,
        };
    }
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
        return connectionResult(configPath, summary);
    }

    // Wix login requires a TTY for the browser-based OAuth flow
    if (!ctx.interactive && 'missingAppFields' in creds && creds.missingAppFields) {
        return {
            status: 'needs-config',
            message: `appStrategy in ${configPath} is missing ${creds.missingAppFields.join(', ')}. Run: jay-stack-cli setup --interactive to regenerate it (DL #54)`,
        };
    }
    if (!ctx.interactive) {
        return {
            status: 'needs-config',
            message: 'Wix login requires interactive mode. Run: jay-stack-cli setup --interactive',
        };
    }

    ensureWixLogin(ctx.projectRoot, ctx.interactive);
    ensureWixSiteConnection(ctx.projectRoot);

    const wixConfig = readWixConfig(ctx.projectRoot);
    if (!wixConfig || !wixConfig.siteId || !wixConfig.appId) {
        return {
            status: 'needs-config',
            message: 'wix.config.json missing or incomplete — run setup again',
        };
    }

    console.log(
        `[wix-server-client] Fetching app secret and instance for site ${wixConfig.siteId}...`,
    );
    const token = getWixToken(ctx.projectRoot);
    const { appSecret } = await fetchAppSecret(token, wixConfig.appId);
    const siteToken = getWixToken(ctx.projectRoot, wixConfig.siteId);
    const instanceId = await fetchAppInstanceId(siteToken, wixConfig.appId);

    const configData = {
        appStrategy: {
            appId: wixConfig.appId,
            appSecret,
            siteId: wixConfig.siteId,
            instanceId,
        },
        oauthStrategy: { clientId: wixConfig.appId },
    };

    fs.mkdirSync(ctx.configDir, { recursive: true });
    fs.writeFileSync(configPath, yaml.dump(configData), 'utf-8');

    ensureGitignore(ctx.projectRoot);

    return connectionResult(configPath, `app: ${wixConfig.appId.substring(0, 8)}...`, {
        configCreated: [`config/${CONFIG_FILE_NAME}`],
    });
}
