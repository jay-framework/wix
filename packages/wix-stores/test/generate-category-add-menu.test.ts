// @vitest-environment node

import { readFileSync } from 'fs';
import { join } from 'path';
import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
    buildCategoryAddMenuItems,
    flattenCategoryTree,
    type CategoryTreeNode,
} from '../lib/add-menu/category-items.js';
import type { WixStoresConfig } from '../lib/config-loader.js';

const REJECTED_ITEM_FIELDS = ['kind', 'parameters', 'component', 'allowedScopes'] as const;
const REQUIRED_ITEM_FIELDS = ['id', 'title', 'category', 'prompt'] as const;

function loadCategoryTreeFixture(): CategoryTreeNode[] {
    const fixturePath = join(import.meta.dirname, 'fixtures/add-menu/category-tree.yaml');
    const parsed = loadYaml(readFileSync(fixturePath, 'utf-8')) as {
        categoryTree: CategoryTreeNode[];
    };
    return parsed.categoryTree;
}

const PREFIXED_URL_CONFIG: WixStoresConfig = {
    urls: {
        product: '/{prefix}/products/{category}/{slug}',
        category: '/{prefix}/products/{category}/',
    },
    defaultCategory: 'all-products',
};

describe('buildCategoryAddMenuItems (Design Log #20 — generated categories)', () => {
    it('creates one item per category in the tree', () => {
        const items = buildCategoryAddMenuItems(loadCategoryTreeFixture(), PREFIXED_URL_CONFIG);
        expect(items).toHaveLength(6);
    });

    it('uses unique ids and required schema fields', () => {
        const items = buildCategoryAddMenuItems(loadCategoryTreeFixture(), PREFIXED_URL_CONFIG);
        const ids = items.map((item) => item.id);

        expect(new Set(ids).size).toBe(items.length);
        expect(ids.every((id) => id.startsWith('wix-stores:category:'))).toBe(true);

        for (const item of items) {
            expect(item.category).toBe('Store');
            expect(item.pluginName).toBe('wix-stores');
            expect(item.packageName).toBe('@jay-framework/wix-stores');

            for (const field of REQUIRED_ITEM_FIELDS) {
                expect(typeof item[field]).toBe('string');
                expect((item[field] as string).trim().length).toBeGreaterThan(0);
            }
            for (const field of REJECTED_ITEM_FIELDS) {
                expect(item).not.toHaveProperty(field);
            }
        }
    });

    it('groups hierarchical categories under their root name as subCategory', () => {
        const items = buildCategoryAddMenuItems(loadCategoryTreeFixture(), PREFIXED_URL_CONFIG);
        const byId = Object.fromEntries(items.map((item) => [item.id, item]));

        expect(byId['wix-stores:category:kitan']?.subCategory).toBe('Kitan');
        expect(byId['wix-stores:category:bedroom']?.subCategory).toBe('Kitan');
        expect(byId['wix-stores:category:bathroom']?.subCategory).toBe('Kitan');
        expect(byId['wix-stores:category:towels']?.subCategory).toBe('Kitan');
        expect(byId['wix-stores:category:polgat']?.subCategory).toBe('Polgat');
        expect(byId['wix-stores:category:shoes']?.subCategory).toBe('Polgat');
    });

    it('uses Categories subCategory for flat top-level categories without children', () => {
        const flatRoots: CategoryTreeNode[] = [
            {
                _id: 'sale-id',
                name: 'Winter Sale',
                slug: 'winter-sale',
                productCount: 10,
                children: [],
            },
        ];
        const items = buildCategoryAddMenuItems(flatRoots, PREFIXED_URL_CONFIG);

        expect(items).toHaveLength(1);
        expect(items[0]?.subCategory).toBe('Categories');
    });

    it('includes full category facts and binding hints in prompt', () => {
        const items = buildCategoryAddMenuItems(loadCategoryTreeFixture(), PREFIXED_URL_CONFIG);
        const towels = items.find((item) => item.id === 'wix-stores:category:towels');

        expect(towels?.title).toEqual('Category — Kitan › Bathroom › Towels (kitan)');
        expect(towels?.prompt).toEqual(
            [
                'Scope this request to Wix Stores category "Towels".',
                '',
                'Category facts (from agent-kit/references/wix-stores/categories.yaml):',
                '  Category ID: towels-id',
                '  Category slug: towels',
                '  Product count: 12',
                '  Hierarchy: Kitan > Bathroom > Towels',
                '  Parent category slug: bathroom',
                '  Root / prefix category slug: kitan',
                '  Example category URL (config/.wix-stores.yaml): /kitan/products/towels/',
                '',
                'Full indexed category tree: agent-kit/references/wix-stores/categories.yaml',
                '',
                'Common headless bindings for this category:',
                '  product-search — filter by category slug via jay-params, e.g. category="towels"; prefix="kitan" when URL template uses {prefix}',
                '  category-list — show direct children with parentCategory="bathroom"; this category\'s children use parentCategory="towels"',
                '  category-products — pass categorySlug="towels" to show products from this category; optionally pass productId to exclude a product',
                '',
                'Contracts:',
                '  agent-kit/materialized-contracts/wix-stores/product-search.jay-contract',
                '  agent-kit/materialized-contracts/wix-stores/category-list.jay-contract',
                '  agent-kit/materialized-contracts/wix-stores/category-products.jay-contract',
                '',
                'Bind ViewState and refs per agent-kit/designer/INSTRUCTIONS.md.',
                '',
                'Project defaultCategory (fallback when no category context): all-products',
            ].join('\n'),
        );
    });

    it('formats root category titles without breadcrumb path', () => {
        const items = buildCategoryAddMenuItems(loadCategoryTreeFixture(), PREFIXED_URL_CONFIG);
        const polgat = items.find((item) => item.id === 'wix-stores:category:polgat');

        expect(polgat?.title).toEqual('Category — Polgat');
        expect(polgat?.prompt).toEqual(expect.stringMatching(/Category slug: polgat/));
        expect(polgat?.prompt).toEqual(expect.stringMatching(/parentCategory="polgat"/));
    });
});

describe('flattenCategoryTree', () => {
    it('walks depth-first and records parent chain', () => {
        const roots = loadCategoryTreeFixture();
        const flat = flattenCategoryTree(roots);

        expect(flat.map((entry) => entry.node.slug)).toEqual([
            'kitan',
            'bedroom',
            'bathroom',
            'towels',
            'polgat',
            'shoes',
        ]);
        expect(flat.find((entry) => entry.node.slug === 'towels')).toEqual(
            expect.objectContaining({
                breadcrumbNames: ['Kitan', 'Bathroom'],
                breadcrumbSlugs: ['kitan', 'bathroom'],
                rootSlug: 'kitan',
                rootName: 'Kitan',
                rootHasChildren: true,
                parentSlug: 'bathroom',
            }),
        );
    });
});
