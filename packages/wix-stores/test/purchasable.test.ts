// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { StockStatus } from '../lib/contracts/product-page.jay-contract';
import {
    initialActionsEnabled,
    isPreOrderRequest,
    isPurchasable,
    mapVariantStock,
    pickDefaultVariant,
} from '../lib/utils/purchasable.js';

// The contract's enum, as `jay-cli definitions` generates it (vitest does not compile linked sub-contracts).
vi.mock('../lib/contracts/product-page.jay-contract', () => ({
    StockStatus: { OUT_OF_STOCK: 0, IN_STOCK: 1 },
}));

// Catalog V3 variant inventory statuses
const inStock = { inStock: true, preorderEnabled: false };
const preOrder = { inStock: false, preorderEnabled: true };
const outOfStock = { inStock: false, preorderEnabled: false };

const variant = (_id: string, inventoryStatus: typeof inStock) => ({
    _id,
    ...mapVariantStock(inventoryStatus),
});

describe('mapVariantStock', () => {
    it('keeps stock status meaning "in stock" and carries the pre-order flag', () => {
        expect(mapVariantStock(inStock)).toEqual({
            inventoryStatus: StockStatus.IN_STOCK,
            preorderEnabled: false,
        });
        expect(mapVariantStock(preOrder)).toEqual({
            inventoryStatus: StockStatus.OUT_OF_STOCK,
            preorderEnabled: true,
        });
        expect(mapVariantStock({})).toEqual({
            inventoryStatus: StockStatus.OUT_OF_STOCK,
            preorderEnabled: false,
        });
    });
});

describe('isPurchasable', () => {
    it('lets visitors buy in-stock and pre-order variants', () => {
        expect(isPurchasable(mapVariantStock(inStock))).toBe(true);
        expect(isPurchasable(mapVariantStock(preOrder))).toBe(true);
    });

    it('keeps out-of-stock variants without pre-order unpurchasable', () => {
        expect(isPurchasable(mapVariantStock(outOfStock))).toBe(false);
    });
});

describe('pickDefaultVariant', () => {
    it('prefers the first in-stock variant', () => {
        const variants = [variant('a', outOfStock), variant('b', preOrder), variant('c', inStock)];
        expect(pickDefaultVariant(variants)._id).toBe('c');
    });

    it('falls back to the first pre-order variant, then to the first variant', () => {
        expect(pickDefaultVariant([variant('a', outOfStock), variant('b', preOrder)])._id).toBe(
            'b',
        );
        expect(pickDefaultVariant([variant('a', outOfStock), variant('b', outOfStock)])._id).toBe(
            'a',
        );
    });
});

describe('initialActionsEnabled', () => {
    it('enables add to cart / buy now for an out-of-stock product open for pre-order', () => {
        expect(initialActionsEnabled(StockStatus.OUT_OF_STOCK, mapVariantStock(preOrder))).toBe(
            true,
        );
    });

    it('enables them for an in-stock product and its in-stock variant', () => {
        expect(initialActionsEnabled(StockStatus.IN_STOCK, mapVariantStock(inStock))).toBe(true);
    });

    it('keeps them disabled for an out-of-stock product or variant without pre-order', () => {
        expect(initialActionsEnabled(StockStatus.OUT_OF_STOCK, mapVariantStock(outOfStock))).toBe(
            false,
        );
        expect(initialActionsEnabled(StockStatus.IN_STOCK, mapVariantStock(outOfStock))).toBe(
            false,
        );
    });
});

describe('isPreOrderRequest', () => {
    it('requests a pre-order for an out-of-stock variant with pre-order enabled', () => {
        expect(isPreOrderRequest(preOrder)).toBe(true);
    });

    it('does not flag in-stock variants, out-of-stock ones without pre-order, or missing status', () => {
        expect(isPreOrderRequest(inStock)).toBe(false);
        expect(isPreOrderRequest({ inStock: true, preorderEnabled: true })).toBe(false);
        expect(isPreOrderRequest(outOfStock)).toBe(false);
        expect(isPreOrderRequest(undefined)).toBe(false);
    });
});
