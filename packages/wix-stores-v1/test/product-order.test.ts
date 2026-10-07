// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { pageInProductOrder, usesProductOrder } from '../lib/utils/product-order.js';

// Every product of the store, as the V1 query returns them sorted by numericId.
const byNumericId = ['lamp', 'perfume', 'shoes', 'glasses', 'watch', 'hoodie', 'cactus', 'mug'].map(
    (slug, i) => ({ slug, numericId: String(1000 + i) }),
);
const slugs = (products: { slug?: string }[]) => products.map((p) => p.slug);

describe('pageInProductOrder', () => {
    const productOrder = ['shoes', 'glasses', 'watch', 'hoodie', 'cactus'];

    it('lists the productOrder slugs first, in that order, then the rest by numericId', () => {
        const result = pageInProductOrder(byNumericId, productOrder, 1, 100);
        expect(slugs(result.products)).toEqual([
            'shoes',
            'glasses',
            'watch',
            'hoodie',
            'cactus',
            'lamp',
            'perfume',
            'mug',
        ]);
    });

    it('pages the ordered listing and keeps the total of every product', () => {
        const page1 = pageInProductOrder(byNumericId, productOrder, 1, 3);
        const page2 = pageInProductOrder(byNumericId, productOrder, 2, 3);
        const page3 = pageInProductOrder(byNumericId, productOrder, 3, 3);
        expect(slugs(page1.products)).toEqual(['shoes', 'glasses', 'watch']);
        expect(slugs(page2.products)).toEqual(['hoodie', 'cactus', 'lamp']);
        expect(slugs(page3.products)).toEqual(['perfume', 'mug']);
        expect([page1, page2, page3].map((r) => r.totalResults)).toEqual([8, 8, 8]);
        expect(pageInProductOrder(byNumericId, productOrder, 4, 3)).toEqual({
            products: [],
            totalResults: 8,
        });
    });

    it('ignores configured slugs the store does not have, and keeps products without a slug', () => {
        const result = pageInProductOrder([{ slug: 'a' }, {}, { slug: 'b' }], ['gone', 'b'], 1, 12);
        expect(slugs(result.products)).toEqual(['b', 'a', undefined]);
        expect(result.totalResults).toBe(3);
    });

    it('does not modify the given products', () => {
        const products = [...byNumericId];
        pageInProductOrder(products, productOrder, 1, 12);
        expect(products).toEqual(byNumericId);
    });
});

describe('usesProductOrder', () => {
    const productOrder = ['shoes', 'glasses'];

    it('applies to the default listing: relevance sort, no query and no filter', () => {
        expect(usesProductOrder(productOrder, 'relevance', {})).toBe(true);
    });

    it('does not apply without a configured product order', () => {
        expect(usesProductOrder([], 'relevance', {})).toBe(false);
    });

    it('does not reorder a search with a query or a filter', () => {
        expect(usesProductOrder(productOrder, 'relevance', { name: { $startsWith: 'sh' } })).toBe(
            false,
        );
        expect(
            usesProductOrder(productOrder, 'relevance', {
                'collections.id': { $hasSome: ['c1'] },
            }),
        ).toBe(false);
        expect(usesProductOrder(productOrder, 'relevance', { price: { $gte: 10 } })).toBe(false);
    });

    it('does not reorder an explicit sort', () => {
        for (const sortBy of ['price_asc', 'price_desc', 'name_asc', 'name_desc', 'newest']) {
            expect(usesProductOrder(productOrder, sortBy, {})).toBe(false);
        }
    });
});
