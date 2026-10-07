// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/contracts/product-page.jay-contract', () => ({
    StockStatus: { OUT_OF_STOCK: 0, IN_STOCK: 1 },
}));

import { buildWixStoresAddToCartOptions } from '../lib/contexts/build-add-to-cart-options.js';

describe('buildWixStoresAddToCartOptions', () => {
    it('requests a pre-order for an out-of-stock variant with pre-order enabled', () => {
        expect(
            buildWixStoresAddToCartOptions(
                { slug: 'pre-order-sku' },
                {
                    _id: 'variant-pre',
                    inventoryStatus: { inStock: false, preorderEnabled: true },
                },
                {},
                {},
            ),
        ).toEqual({
            variantId: 'variant-pre',
            modifiers: {},
            customTextFields: {},
            productSlug: 'pre-order-sku',
            preOrderRequested: true,
        });
    });

    it('does not request a pre-order for in-stock or plain out-of-stock variants', () => {
        const base = {
            variantId: 'v1',
            modifiers: {},
            customTextFields: {},
            productSlug: 'sku',
        };
        expect(
            buildWixStoresAddToCartOptions(
                { slug: 'sku' },
                { _id: 'v1', inventoryStatus: { inStock: true, preorderEnabled: false } },
                {},
                {},
            ),
        ).toEqual({ ...base, preOrderRequested: false });
        expect(
            buildWixStoresAddToCartOptions(
                { slug: 'sku' },
                { _id: 'v1', inventoryStatus: { inStock: false, preorderEnabled: false } },
                {},
                {},
            ),
        ).toEqual({ ...base, preOrderRequested: false });
    });
});
