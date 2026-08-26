// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PluginSetupContext } from '@jay-framework/stack-server-runtime';

import { setupWixBookings } from '../lib/setup.js';

const WIX_FORMS_PACKAGE = '@jay-framework/wix-forms';

let tempDir: string | undefined;

afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        tempDir = undefined;
    }
});

function createProject(options: {
    includeWixForms?: boolean;
    includeFormsConfig?: boolean;
    bookingsConfig?: string;
}): PluginSetupContext {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wix-bookings-setup-'));
    const configDir = path.join(tempDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    const dependencies: Record<string, string> = {
        '@jay-framework/wix-bookings': '^0.24.0',
    };
    if (options.includeWixForms !== false) {
        dependencies[WIX_FORMS_PACKAGE] = '^0.24.0';
    }

    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ dependencies }, null, 2));

    if (options.includeFormsConfig) {
        fs.writeFileSync(
            path.join(configDir, '.wix-forms.yaml'),
            'defaultFormId: form-123\n',
        );
    }

    fs.writeFileSync(
        path.join(configDir, '.wix-bookings.yaml'),
        options.bookingsConfig ??
            'bookingAppId: app-1\nstaffResourceTypeId: staff-1\nslotWindowDays: 14\npostCheckoutUrl: /book\n',
    );

    return {
        pluginName: 'wix-bookings',
        projectRoot: tempDir,
        configDir,
        services: new Map(),
        force: false,
        interactive: false,
        prompt: {
            input: async () => '',
            confirm: async () => false,
            select: async () => '',
        },
    };
}

describe('setupWixBookings', () => {
    it('reports error when @jay-framework/wix-forms is not installed', async () => {
        const result = await setupWixBookings(
            createProject({ includeWixForms: false, includeFormsConfig: true }),
        );

        expect(result.status).toBe('error');
        expect(result.message).toContain('@jay-framework/wix-forms');
        expect(result.message).toContain('jay-stack setup wix-forms');
    });

    it('reports error when config/.wix-forms.yaml is missing', async () => {
        const result = await setupWixBookings(
            createProject({ includeWixForms: true, includeFormsConfig: false }),
        );

        expect(result.status).toBe('error');
        expect(result.message).toContain('config/.wix-forms.yaml');
        expect(result.message).toContain('jay-stack setup wix-forms');
    });

    it('does not require wix-forms service registration during setup', async () => {
        const result = await setupWixBookings(
            createProject({ includeWixForms: true, includeFormsConfig: true }),
        );

        expect(result).toEqual({
            status: 'configured',
            configCreated: [],
            message: 'Wix Bookings configured (app: app-1)',
        });
    });
});
