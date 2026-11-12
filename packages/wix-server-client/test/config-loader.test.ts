import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../lib/config-loader';

function withConfig(yaml: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wix-config-'));
    fs.mkdirSync(path.join(dir, 'config'));
    fs.writeFileSync(path.join(dir, 'config/.wix.yaml'), yaml);
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
}

describe('loadConfig', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('reads a site with only an OAuth client as visitor-only: no server secret ships with it', () => {
        withConfig('oauthStrategy:\n  clientId: c1\n');
        expect(loadConfig()).toEqual({ auth: { kind: 'visitor' }, oauth: { clientId: 'c1' } });
    });

    it('keeps an API key for the server when there is one, and rejects two server strategies', () => {
        withConfig('oauthStrategy:\n  clientId: c1\napiKeyStrategy:\n  apiKey: k\n  siteId: s\n');
        expect(loadConfig().auth).toEqual({ kind: 'apiKey', apiKey: { apiKey: 'k', siteId: 's' } });
        withConfig(
            'oauthStrategy:\n  clientId: c1\napiKeyStrategy:\n  apiKey: k\n  siteId: s\nappStrategy:\n  appId: a\n  appSecret: x\n',
        );
        expect(() => loadConfig()).toThrow('only one of');
    });

    it('keeps an app strategy scoped to one site instance', () => {
        withConfig(
            'oauthStrategy:\n  clientId: a\nappStrategy:\n  appId: a\n  appSecret: x\n  siteId: s\n  instanceId: i\n',
        );
        expect(loadConfig().auth).toEqual({
            kind: 'app',
            app: { appId: 'a', appSecret: 'x', siteId: 's', instanceId: 'i' },
        });
    });

    it.each([
        ['siteId', 'appStrategy:\n  appId: a\n  appSecret: x\n  instanceId: i\n'],
        ['instanceId', 'appStrategy:\n  appId: a\n  appSecret: x\n  siteId: s\n'],
    ])('rejects an app strategy without %s', (field, appYaml) => {
        withConfig(`oauthStrategy:\n  clientId: a\n${appYaml}`);
        expect(() => loadConfig()).toThrow(`appStrategy.${field}`);
    });

    it('keeps a contributor user token, from the config or the WIX_TOKEN env (DL #56)', () => {
        withConfig(
            'oauthStrategy:\n  clientId: c1\nuserTokenStrategy:\n  token: t1\n  siteId: s\n',
        );
        expect(loadConfig().auth).toEqual({
            kind: 'userToken',
            userToken: { token: 't1', siteId: 's' },
        });

        vi.stubEnv('WIX_TOKEN', 'env-token');
        withConfig('oauthStrategy:\n  clientId: c1\nuserTokenStrategy: {}\n');
        expect(loadConfig().auth).toEqual({ kind: 'userToken', userToken: { token: 'env-token' } });
    });

    it('rejects a user token strategy with no token, and next to another server strategy', () => {
        vi.stubEnv('WIX_TOKEN', '');
        withConfig('oauthStrategy:\n  clientId: c1\nuserTokenStrategy: {}\n');
        expect(() => loadConfig()).toThrow('userTokenStrategy.token');

        withConfig(
            'oauthStrategy:\n  clientId: c1\nuserTokenStrategy:\n  token: t1\napiKeyStrategy:\n  apiKey: k\n  siteId: s\n',
        );
        expect(() => loadConfig()).toThrow('only one of');
    });

    it('ignores WIX_TOKEN without a userTokenStrategy section: a visitor config stays visitor', () => {
        vi.stubEnv('WIX_TOKEN', 'env-token');
        withConfig('oauthStrategy:\n  clientId: c1\n');
        expect(loadConfig().auth).toEqual({ kind: 'visitor' });
    });
});
