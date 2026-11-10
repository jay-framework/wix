// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const registered = new Set<string>();

vi.mock('@jay-framework/stack-server-runtime', () => ({
    hasService: vi.fn((marker: string) => registered.has(marker)),
    getService: vi.fn((marker: string) => ({ marker })),
}));
vi.mock('@jay-framework/wix-forms', () => ({ WIX_FORMS_SERVICE: 'forms' }));
vi.mock('@jay-framework/wix-server-client', () => ({
    WIX_CLIENT_SERVICE: 'client',
    serverClientSetupBlocker: (initError?: Error) =>
        registered.has('client')
            ? initError && { status: 'error', message: `Service init failed: ${initError.message}` }
            : {
                  status: 'needs-config',
                  message:
                      'skipped: wix-server-client not configured. Run setup for wix-server-client first.',
              },
}));
vi.mock('@jay-framework/wix-server-client/client', () => ({ wixFetch: vi.fn() }));

import { wixFetch } from '@jay-framework/wix-server-client/client';
import { setupWixBookings } from '../lib/setup.js';

const mockWixFetch = vi.mocked(wixFetch);

function project() {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wix-bookings-setup-'));
    return { projectRoot, configDir: path.join(projectRoot, 'config') } as any;
}

function configText(ctx: { configDir: string }): string {
    return fs.readFileSync(path.join(ctx.configDir, '.wix-bookings.yaml'), 'utf-8');
}

describe('setupWixBookings', () => {
    beforeEach(() => {
        registered.clear();
        mockWixFetch.mockReset();
    });

    /**
     * Bug: with wix-server-client not configured, setup blamed a missing wix-forms plugin.
     * Found in: QA run 2026-11-10 (FEEDBACK #5, #8).
     * Expected: "skipped: wix-server-client not configured", the upstream cause.
     * Actual: "wix-bookings requires the wix-forms plugin" (wix-forms was installed).
     */
    it('should report an unconfigured wix-server-client instead of a missing wix-forms', async () => {
        const result = await setupWixBookings({
            ...project(),
            initError: new Error("Service 'jay:service:WixClientService' not found."),
        });

        expect(result.status).toBe('needs-config');
        expect(result.message).toContain('skipped: wix-server-client not configured');
        expect(result.message).not.toContain('requires the wix-forms plugin');
    });

    it('should still require wix-forms when the client is configured but forms is absent', async () => {
        registered.add('client');
        const result = await setupWixBookings(project());
        expect(result).toMatchObject({ status: 'error' });
        expect(result.message).toContain('requires the wix-forms plugin');
    });

    /**
     * Gap: staffResourceTypeId had no "where do I find this" (FEEDBACK #9).
     * Expected: setup reads it from Wix — the typeId of a staff member's resource — and
     * writes it into config/.wix-bookings.yaml.
     */
    it('should fill staffResourceTypeId from the staff resource when it is empty', async () => {
        registered.add('client').add('forms');
        mockWixFetch.mockImplementation(async (_client, url) => {
            if (url === '/bookings/v1/staff-members/query')
                return { staffMembers: [{ id: 'staff-1', resourceId: 'res-staff' }] };
            if (url === '/bookings/v2/resources/query')
                return {
                    resources: [
                        { id: 'res-room', typeId: 'type-room' },
                        { id: 'res-staff', typeId: 'type-staff' },
                    ],
                };
            throw new Error(`unexpected ${url}`);
        });
        const ctx = project();

        const result = await setupWixBookings(ctx);

        expect(result.status).toBe('configured');
        expect(configText(ctx)).toContain('staffResourceTypeId: "type-staff"');
        expect(result.message).toContain('type-staff');
    });

    it('should say where to find staffResourceTypeId when Wix has no staff resource', async () => {
        registered.add('client').add('forms');
        mockWixFetch.mockResolvedValue({});

        const result = await setupWixBookings(project());

        expect(result.status).toBe('needs-config');
        expect(result.message).toContain('staffResourceTypeId');
        expect(result.message).toContain('/bookings/v2/resources/query');
    });

    it('should keep a staffResourceTypeId that is already set, without calling Wix', async () => {
        registered.add('client').add('forms');
        const ctx = project();
        fs.mkdirSync(ctx.configDir);
        fs.writeFileSync(
            path.join(ctx.configDir, '.wix-bookings.yaml'),
            'staffResourceTypeId: "preset"\n',
        );

        const result = await setupWixBookings(ctx);

        expect(result.status).toBe('configured');
        expect(mockWixFetch).not.toHaveBeenCalled();
    });
});
