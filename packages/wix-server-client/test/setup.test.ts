import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ execSync: vi.fn() }));

import { execSync } from 'node:child_process';
import { setupWixServerClient } from '../lib/setup';

function projectWithConfig(yamlText: string) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wix-setup-'));
    const configDir = path.join(projectRoot, 'config');
    fs.mkdirSync(configDir);
    fs.writeFileSync(path.join(configDir, '.wix.yaml'), yamlText);
    return { projectRoot, configDir, interactive: true } as any;
}

describe('setupWixServerClient', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    /**
     * Bug: an unparsable config/.wix.yaml was treated as "no credentials", and setup silently
     * ran `npx @wix/cli@latest login` (which then failed on its Node >= 24 requirement).
     * Found in: QA run 2026-11-10 (FEEDBACK #6).
     * Expected: an error naming the file and the parse problem; no Wix CLI call.
     */
    it('should report a config parse error with the file path instead of running Wix login', async () => {
        const ctx = projectWithConfig('oauthStrategy:\n  clientId: "unterminated\n');

        const result = await setupWixServerClient(ctx);

        expect(result.status).toBe('error');
        expect(result.message).toContain(path.join(ctx.configDir, '.wix.yaml'));
        expect(result.message).toMatch(/could not be parsed/);
        expect(execSync).not.toHaveBeenCalled();
    });

    /**
     * Bug: appStrategy { appId, appSecret } (the shape setup writes) was reported "Wix client
     * connected", but @wix/sdk's AppStrategy cannot produce auth headers without an instance.
     * Found in: QA run 2026-11-10 (FEEDBACK #7).
     * Expected (DL #54): the config is incomplete, not connected; setup names the missing fields
     * and, without a TTY, asks for an interactive run that regenerates them.
     */
    it('should report an appStrategy without siteId and instanceId as incomplete', async () => {
        const ctx = {
            ...projectWithConfig(
                'oauthStrategy:\n  clientId: c1\nappStrategy:\n  appId: app-1\n  appSecret: secret-1\n',
            ),
            interactive: false,
        };

        const result = await setupWixServerClient(ctx);

        expect(result.status).toBe('needs-config');
        expect(result.message).toContain('missing siteId, instanceId');
        expect(result.message).toContain('setup --interactive');
        expect(execSync).not.toHaveBeenCalled();
    });

    it('should report an apiKeyStrategy as connected', async () => {
        const ctx = projectWithConfig(
            'oauthStrategy:\n  clientId: c1\napiKeyStrategy:\n  apiKey: key-1\n  siteId: site-1234-5678\n',
        );

        const result = await setupWixServerClient(ctx);

        expect(result).toMatchObject({ status: 'configured' });
        expect(result.message).toContain('Wix client connected');
    });
});
