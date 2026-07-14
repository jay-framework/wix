// @vitest-environment node

import type { WixClient } from '@wix/sdk';
import { describe, expect, it } from 'vitest';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import type { PluginSetupContext } from '@jay-framework/stack-server-runtime';

import { setupWixMedia } from '../lib/setup.js';

function createSetupContext(
    services: Map<symbol, unknown>,
    initError?: Error,
): PluginSetupContext {
    return {
        pluginName: 'wix-media',
        projectRoot: '/tmp/project',
        configDir: '/tmp/project/config',
        services,
        initError,
        force: false,
    };
}

function createMockWixClient(): WixClient {
    return {
        use: () => ({}),
    } as WixClient;
}

describe('setupWixMedia', () => {
    it('uses ctx.services instead of getService so Vite SSR setup can find wix-server-client', async () => {
        const services = new Map<symbol, unknown>();
        services.set(WIX_CLIENT_SERVICE as symbol, createMockWixClient());

        const result = await setupWixMedia(createSetupContext(services));

        expect(result).toEqual({
            status: 'configured',
            message: 'Wix Media Manager access verified.',
        });
    });

    it('reports needs-config when wix-server-client is not registered', async () => {
        const result = await setupWixMedia(createSetupContext(new Map()));

        expect(result.status).toBe('needs-config');
        expect(result.message).toContain('wix-server-client');
    });

    it('reports needs-config when plugin init failed', async () => {
        const result = await setupWixMedia(
            createSetupContext(new Map(), new Error('init failed')),
        );

        expect(result.status).toBe('needs-config');
        expect(result.message).toContain('wix-server-client');
    });
});
