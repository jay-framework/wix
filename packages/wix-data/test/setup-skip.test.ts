// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/stack-server-runtime', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    hasService: () => false,
}));

import { setupWixData } from '../lib/setup.js';

describe('setupWixData without wix-server-client', () => {
    /**
     * Bug: with no Wix credentials, setup surfaced "Service 'jay:service:WixClientService'
     * not found. Did you register it in jay.init.ts?" — reads like a code bug.
     * Found in: QA run 2026-11-10 (FEEDBACK #5).
     * Expected: "skipped: wix-server-client not configured".
     */
    it('should skip cleanly instead of reporting the missing service', async () => {
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wix-data-setup-'));
        const result = await setupWixData({
            projectRoot,
            configDir: path.join(projectRoot, 'config'),
            initError: new Error("Service 'jay:service:WixClientService' not found."),
        } as any);

        expect(result.status).toBe('needs-config');
        expect(result.message).toContain('skipped: wix-server-client not configured');
        expect(result.message).not.toContain('not found');
    });
});
