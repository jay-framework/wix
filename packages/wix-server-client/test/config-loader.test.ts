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
    afterEach(() => vi.restoreAllMocks());

    it('reads a site with only an OAuth client as visitor-only: no server secret ships with it', () => {
        withConfig('oauthStrategy:\n  clientId: c1\n');
        expect(loadConfig()).toEqual({ auth: { kind: 'visitor' }, oauth: { clientId: 'c1' } });
    });

    it('keeps an API key for the server when there is one, and rejects two server strategies', () => {
        withConfig('oauthStrategy:\n  clientId: c1\napiKeyStrategy:\n  apiKey: k\n  siteId: s\n');
        expect(loadConfig().auth).toEqual({ kind: 'apiKey', apiKey: { apiKey: 'k', siteId: 's' } });
        withConfig('oauthStrategy:\n  clientId: c1\napiKeyStrategy:\n  apiKey: k\n  siteId: s\nappStrategy:\n  appId: a\n  appSecret: x\n');
        expect(() => loadConfig()).toThrow('not both');
    });
});
