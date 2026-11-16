// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

const { fakeWixClient, loadConfig } = vi.hoisted(() => ({
    fakeWixClient: { kind: 'fake-wix-client' },
    loadConfig: vi.fn(async () => ({
        collections: [
            { collectionId: 'Residences', visible: true },
            { collectionId: 'Amenities', visible: false },
        ],
    })),
}));

vi.mock('@jay-framework/stack-server-runtime', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    hasService: () => true,
    getService: (marker: unknown) => {
        if (String(marker).includes('WixClientService')) return fakeWixClient;
        throw new Error(`Service '${String(marker)}' not found.`);
    },
}));

vi.mock('../lib/config-loader', () => ({ loadConfig }));

import { setupWixData } from '../lib/setup.js';

describe('setupWixData before wix-data init has run', () => {
    /**
     * Bug: `jay-stack setup` runs a plugin's setup handler before that plugin's own
     * init, but setupWixData required WixDataService (registered only by wix-data's
     * init), so `jay-stack setup` always failed with
     * "WixDataService not available. Check initialization."
     * Found in: Starkdale production build (README "npm run setup"), 2026-11-16.
     * Expected: setup loads the collections config with the Wix client and reports it.
     * Actual: status "error", "WixDataService not available. Check initialization."
     */
    it('should report the collections config without needing WixDataService', async () => {
        const result = await setupWixData({
            projectRoot: '/project',
            configDir: '/project/config',
        } as any);

        expect(loadConfig).toHaveBeenCalledWith(fakeWixClient);
        expect(result.status).toBe('configured');
        expect(result.message).toBe('2 collections found (1 visible)');
    });
});
