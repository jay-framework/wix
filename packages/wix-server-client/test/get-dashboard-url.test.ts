import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDashboardUrl, resolveDashboardSiteId } from '../lib/actions/get-dashboard-url';

const OAUTH = 'oauthStrategy:\n  clientId: c1\n';
const NO_SITE_ERROR = 'Ask the site owner to configure the Wix site.';

function project(files: { wixYaml?: string; wixConfigJson?: string }): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wix-dashboard-'));
    if (files.wixYaml !== undefined) {
        fs.mkdirSync(path.join(dir, 'config'));
        fs.writeFileSync(path.join(dir, 'config/.wix.yaml'), files.wixYaml);
    }
    if (files.wixConfigJson !== undefined) {
        fs.writeFileSync(path.join(dir, 'wix.config.json'), files.wixConfigJson);
    }
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    return dir;
}

describe('resolveDashboardSiteId', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses the API-key siteId over wix.config.json', () => {
        const dir = project({
            wixYaml: `${OAUTH}apiKeyStrategy:\n  apiKey: k\n  siteId: api-site\n`,
            wixConfigJson: '{"appId":"a","siteId":"cli-site"}',
        });
        expect(resolveDashboardSiteId(dir)).toBe('api-site');
    });

    it('uses the app-strategy siteId over wix.config.json', () => {
        const dir = project({
            wixYaml: `${OAUTH}appStrategy:\n  appId: a\n  appSecret: x\n  siteId: app-site\n  instanceId: i\n`,
            wixConfigJson: '{"appId":"a","siteId":"cli-site"}',
        });
        expect(resolveDashboardSiteId(dir)).toBe('app-site');
    });

    it.each([
        ['no config/.wix.yaml', undefined],
        ['.wix.yaml without oauthStrategy', 'apiKeyStrategy:\n  apiKey: k\n  siteId: s\n'],
        ['visitor-only config', OAUTH],
        ['incomplete app strategy', `${OAUTH}appStrategy:\n  appId: a\n  appSecret: x\n`],
    ])('falls back to wix.config.json siteId with %s', (_case, wixYaml) => {
        const dir = project({ wixYaml, wixConfigJson: '{"appId":"a","siteId":"cli-site"}' });
        expect(resolveDashboardSiteId(dir)).toBe('cli-site');
    });

    it('throws a configure-the-site error when neither source has a siteId', () => {
        const dir = project({ wixYaml: OAUTH, wixConfigJson: '{"appId":"a","siteId":""}' });
        expect(() => resolveDashboardSiteId(dir)).toThrow(NO_SITE_ERROR);
    });

    it('throws the same error with no config files at all', () => {
        const dir = project({});
        expect(() => resolveDashboardSiteId(dir)).toThrow(NO_SITE_ERROR);
    });
});

describe('buildDashboardUrl', () => {
    it('joins the dashboard base, siteId and path', () => {
        expect(buildDashboardUrl('site-1', 'wix-stores/products/product/abc-123')).toBe(
            'https://manage.wix.com/dashboard/site-1/wix-stores/products/product/abc-123',
        );
    });

    it('strips leading slashes from the path', () => {
        expect(buildDashboardUrl('site-1', '//wix-stores/products')).toBe(
            'https://manage.wix.com/dashboard/site-1/wix-stores/products',
        );
    });

    /**
     * Found in: DL #38 Phase A live route check — the dashboard opens a namespaced collection only with
     * its "/" encoded (`wix-cms/data/Bookings%2FServices`); the raw `Bookings/Services` fails to load.
     */
    it('accepts a percent-encoded namespaced CMS collection id', () => {
        expect(buildDashboardUrl('site-1', 'wix-cms/data/Bookings%2FServices')).toBe(
            'https://manage.wix.com/dashboard/site-1/wix-cms/data/Bookings%2FServices',
        );
    });

    it.each([
        ['empty', ''],
        ['only slashes', '///'],
        ['traversal', 'wix-stores/../settings'],
        ['a scheme', 'https://evil.example/x'],
        ['a query', 'wix-stores/products?x=1'],
        ['a fragment', 'wix-stores/products#x'],
        ['a space', 'wix stores'],
        ['a malformed percent escape', 'wix-cms/data/Bookings%2'],
        ['an encoded traversal', 'wix-stores/%2e%2e/settings'],
    ])('rejects a path with %s', (_case, dashboardPath) => {
        expect(() => buildDashboardUrl('site-1', dashboardPath)).toThrow('Invalid dashboard path');
    });
});
