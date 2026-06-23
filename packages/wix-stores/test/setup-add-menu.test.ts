// @vitest-environment node

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { load as loadYaml } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginSetupContext } from '@jay-framework/stack-server-runtime';
import { setupWixStores } from '../lib/setup.js';

// Canonical shape reference (no @jay-framework/aiditor import):
// jay-aiditor/packages/aiditor/test/fixtures/add-menu/valid-item.yaml

const REJECTED_ITEM_FIELDS = ['kind', 'parameters', 'component', 'allowedScopes'] as const;
const REQUIRED_ITEM_FIELDS = ['id', 'title', 'category', 'prompt'] as const;

const EXPECTED_IDS = [
    'wix-stores:product-search',
    'wix-stores:product-page',
    'wix-stores:category-products',
    'wix-stores:category-list',
] as const;

const ADD_MENU_OUTPUT_REL = 'agent-kit/aiditor/add-menu/wix-stores.yaml';

vi.mock('@jay-framework/stack-server-runtime', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@jay-framework/stack-server-runtime')>();
    return {
        ...actual,
        getService: vi.fn(() => ({
            urls: { product: '/products/{slug}' },
            products: { searchProducts: vi.fn().mockResolvedValue({}) },
        })),
    };
});

function makeCtx(
    projectRoot: string,
    overrides: Partial<PluginSetupContext> = {},
): PluginSetupContext {
    return {
        pluginName: 'wix-stores',
        projectRoot,
        configDir: join(projectRoot, 'config'),
        services: new Map(),
        force: false,
        ...overrides,
    };
}

function loadExpectedCatalog() {
    const fixturePath = join(import.meta.dirname, 'fixtures/add-menu/expected-wix-stores.yaml');
    return loadYaml(readFileSync(fixturePath, 'utf-8'));
}

function assertAddMenuCatalogShape(catalog: unknown): void {
    expect(catalog).toEqual(expect.objectContaining({ items: expect.any(Array) }));

    const items = (catalog as { items: Record<string, unknown>[] }).items;
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.id)).toEqual([...EXPECTED_IDS]);

    for (const item of items) {
        for (const field of REQUIRED_ITEM_FIELDS) {
            expect(typeof item[field]).toBe('string');
            expect((item[field] as string).trim().length).toBeGreaterThan(0);
        }
        for (const field of REJECTED_ITEM_FIELDS) {
            expect(item).not.toHaveProperty(field);
        }
    }
}

describe('setupWixStores add-menu catalog (Design Log #20 W2)', () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = mkdtempSync(join(tmpdir(), 'wix-stores-setup-'));
        mkdirSync(join(projectRoot, 'config'), { recursive: true });
        writeFileSync(
            join(projectRoot, 'config/.wix-stores.yaml'),
            'urls:\n  product: "/products/{slug}"\n',
        );
    });

    afterEach(() => {
        rmSync(projectRoot, { recursive: true, force: true });
    });

    it('writes wix-stores.yaml with four catalog items matching expected fixture', async () => {
        const result = await setupWixStores(makeCtx(projectRoot));

        expect(result.status).toBe('configured');
        expect(result.configCreated).toEqual([ADD_MENU_OUTPUT_REL]);

        const outputPath = join(projectRoot, ADD_MENU_OUTPUT_REL);
        expect(existsSync(outputPath)).toBe(true);

        const written = loadYaml(readFileSync(outputPath, 'utf-8'));
        assertAddMenuCatalogShape(written);
        expect(written).toEqual(loadExpectedCatalog());
    });

    it('product-page prompt references materialized contract path', async () => {
        await setupWixStores(makeCtx(projectRoot));

        const outputPath = join(projectRoot, ADD_MENU_OUTPUT_REL);
        const written = loadYaml(readFileSync(outputPath, 'utf-8')) as {
            items: { id: string; prompt: string }[];
        };
        const productPage = written.items.find((item) => item.id === 'wix-stores:product-page');

        expect(productPage?.prompt).toEqual(
            expect.stringMatching(
                /agent-kit\/materialized-contracts\/wix-stores\/product-page\.jay-contract/,
            ),
        );
    });

    it('skips rewrite when output exists and force is false', async () => {
        const addMenuDir = join(projectRoot, 'agent-kit/aiditor/add-menu');
        mkdirSync(addMenuDir, { recursive: true });
        writeFileSync(join(addMenuDir, 'wix-stores.yaml'), 'items: []\n');

        const result = await setupWixStores(makeCtx(projectRoot));

        expect(result.status).toBe('configured');
        expect(result.configCreated).toBeUndefined();

        const written = loadYaml(readFileSync(join(addMenuDir, 'wix-stores.yaml'), 'utf-8'));
        expect(written).toEqual({ items: [] });
    });

    it('rewrites output when force is true', async () => {
        const addMenuDir = join(projectRoot, 'agent-kit/aiditor/add-menu');
        mkdirSync(addMenuDir, { recursive: true });
        writeFileSync(join(addMenuDir, 'wix-stores.yaml'), 'items: []\n');

        const result = await setupWixStores(makeCtx(projectRoot, { force: true }));

        expect(result.status).toBe('configured');
        expect(result.configCreated).toEqual([ADD_MENU_OUTPUT_REL]);

        const written = loadYaml(readFileSync(join(addMenuDir, 'wix-stores.yaml'), 'utf-8'));
        assertAddMenuCatalogShape(written);
        expect(written).toEqual(loadExpectedCatalog());
    });
});
