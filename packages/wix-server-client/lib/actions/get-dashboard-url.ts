import { makeJayQuery } from '@jay-framework/fullstack-component';
import { loadConfig } from '../config-loader.js';
import { readWixConfig } from '../wix-config-file.js';

const DASHBOARD_BASE = 'https://manage.wix.com/dashboard';
// Percent escapes are allowed: namespaced CMS collection ids only open with "/" encoded (`Bookings%2FServices`).
const DASHBOARD_PATH_CHARSET = /^(?:[A-Za-z0-9/_.-]|%[0-9A-Fa-f]{2})+$/;

/**
 * devOnly (DL #38): the Wix dashboard URL for a dashboard path. The site id is read here, server-side,
 * so the agent never reads `config/.wix.yaml` (it holds the API key).
 */
export const getDashboardUrl = makeJayQuery('wixServerClient.getDashboardUrl').withHandler(
    async (input: { path: string }) => ({
        url: buildDashboardUrl(resolveDashboardSiteId(process.cwd()), input.path),
    }),
);

export function buildDashboardUrl(siteId: string, dashboardPath: string): string {
    const relativePath = dashboardPath.replace(/^\/+/, '');
    const isValid =
        DASHBOARD_PATH_CHARSET.test(relativePath) &&
        !relativePath.split('/').some((segment) => decodeURIComponent(segment) === '..');
    if (!isValid) {
        throw new Error(
            `Invalid dashboard path "${dashboardPath}": use a route like "wix-stores/products" (letters, digits, / _ . - and %XX escapes only; no "..", query or scheme).`,
        );
    }
    return `${DASHBOARD_BASE}/${siteId}/${relativePath}`;
}

/** API-key siteId from `config/.wix.yaml`, else `wix.config.json` siteId (visitor/app configs carry none). */
export function resolveDashboardSiteId(projectRoot: string): string {
    const siteId = apiKeySiteId() || readWixConfig(projectRoot)?.siteId;
    if (!siteId) {
        throw new Error(
            'No Wix site id in config/.wix.yaml (apiKeyStrategy.siteId) or wix.config.json (siteId). Ask the site owner to configure the Wix site.',
        );
    }
    return siteId;
}

function apiKeySiteId(): string | undefined {
    try {
        const { auth } = loadConfig();
        return auth.kind === 'apiKey' ? auth.apiKey.siteId : undefined;
    } catch {
        return undefined;
    }
}
