// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildProductPageContractYaml } from '../lib/generators/product-page-contract-generator.js';

/**
 * Bug: the materialized product-page contract carries no source-editing guide.
 * Found in: AIditor QA on a product page — the agent never got the wix-stores
 *   guide and replied with an invented dashboard link.
 * Expected: the generated contract names its guide, like the wix-data generated contracts (DL #39).
 * Actual: the contract starts with name/description/params only.
 */
describe('buildProductPageContractYaml', () => {
    it('should name the wix-stores source-editing guide in the generated contract', () => {
        const header = buildProductPageContractYaml(undefined).split('\n').slice(0, 3);

        expect(header).toEqual([
            'name: product-page',
            'description: Full product detail page with variants, options, media gallery, and add-to-cart. Use for individual product pages.',
            'editingGuide: agent-kit/designer/wix-stores-dashboard-content.md',
        ]);
    });

    it('should append the extended fields block after the base contract', () => {
        const yaml = buildProductPageContractYaml('  - tag: extendedFields');

        expect(yaml.endsWith('\n\n  - tag: extendedFields')).toBe(true);
    });
});
