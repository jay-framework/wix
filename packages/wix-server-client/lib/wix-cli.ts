/**
 * Setup-time Wix user access through the Wix CLI (DL #47): the user's token, and the app instances
 * of a site. Runs only under the toolchain (`./tools`), never on the serve path.
 */

import { execSync } from 'node:child_process';
import { readWixConfig } from './wix-config-file.js';

const APP_INSTANCES_URL = 'https://www.wixapis.com/apps-installer-service/v1/app-instances';
const INSTALL_APP_URL = 'https://www.wixapis.com/apps-installer-service/v1/app-instance/install';

export interface SiteAppInstance {
    id: string;
    appDefId: string;
}

export type SiteAppStatus = 'present' | 'installed';

let loginChecked = false;

/**
 * Makes sure the Wix CLI has a logged-in Wix user; checked once per process. Logging in opens a
 * browser, so without `interactive` a missing login throws instead.
 */
export function ensureWixLogin(projectRoot: string, interactive = true): void {
    if (loginChecked) return;
    console.log('[wix-server-client] Checking Wix CLI login...');
    try {
        execSync('npx --yes @wix/cli@latest whoami', { cwd: projectRoot, stdio: 'pipe' });
    } catch {
        if (!interactive) {
            throw new Error('Not logged in to the Wix CLI. Run: jay-stack-cli setup --interactive');
        }
        execSync('npx --yes @wix/cli@latest login', { cwd: projectRoot, stdio: 'inherit' });
    }
    loginChecked = true;
}

/** The Wix user's token; with `siteId`, scoped to that site. */
export function getWixToken(projectRoot: string, siteId?: string): string {
    const command = siteId
        ? `npx --yes @wix/cli@latest token --site ${siteId}`
        : 'npx --yes @wix/cli@latest token';
    const token = execSync(command, {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!token) {
        throw new Error('Empty token from wix cli. Are you logged in?');
    }
    return token;
}

/** The app instances of the site `siteToken` is scoped to; an account token lists none. */
export async function listSiteAppInstances(siteToken: string): Promise<SiteAppInstance[]> {
    const response = await fetch(APP_INSTANCES_URL, {
        method: 'GET',
        headers: { Authorization: siteToken, 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Apps Installer API failed (${response.status}): ${body}`);
    }

    const data: { appInstances?: SiteAppInstance[] } = await response.json();
    return data.appInstances ?? [];
}

/** Installs `appDefId` on `siteId`. Needs a Wix user token: an app token cannot install apps. */
export async function installSiteApp(
    siteToken: string,
    siteId: string,
    appDefId: string,
): Promise<SiteAppInstance> {
    const response = await fetch(INSTALL_APP_URL, {
        method: 'POST',
        headers: { Authorization: siteToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tenant: { tenantType: 'SITE', id: siteId },
            appInstance: { appDefId, enabled: true },
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Install App failed (${response.status}): ${body}`);
    }

    const data: { appInstance: SiteAppInstance } = await response.json();
    return data.appInstance;
}

/**
 * Installs `appDefId` on the `wix.config.json` site when it is missing, for plugin setups that need a
 * Wix app (e.g. Wix Stores). Installing needs a Wix user, not the app token, so it checks the Wix CLI
 * login first. Returns the site token for follow-up calls by the caller.
 */
export async function ensureSiteAppInstalled(
    projectRoot: string,
    appDefId: string,
    options: { appName: string; interactive: boolean },
): Promise<{ status: SiteAppStatus; siteToken: string }> {
    const siteId = readWixConfig(projectRoot)?.siteId;
    if (!siteId) {
        throw new Error(`Cannot install ${options.appName}: wix.config.json has no siteId`);
    }

    ensureWixLogin(projectRoot, options.interactive);
    const siteToken = getWixToken(projectRoot, siteId);

    const instances = await listSiteAppInstances(siteToken);
    if (instances.some((app) => app.appDefId === appDefId)) {
        return { status: 'present', siteToken };
    }

    console.log(`[wix-server-client] Installing ${options.appName} on site ${siteId}...`);
    await installSiteApp(siteToken, siteId, appDefId);
    return { status: 'installed', siteToken };
}
