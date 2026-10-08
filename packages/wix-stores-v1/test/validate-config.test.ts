// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    validateLocale,
    validateProductOrderSlugs,
    validateWixStoresV1ConfigValue,
} from '../lib/validate-config.js';

describe('validateLocale', () => {
    it('accepts a valid BCP 47 locale tag', () => {
        expect(validateLocale('he-IL')).toEqual([]);
    });

    it('reports an error for a locale tag with invalid characters', () => {
        const issues = validateLocale('@not-valid');
        expect(issues).toHaveLength(1);
        expect(issues[0]?.severity).toBe('error');
    });

    it('skips validation when locale is unset', () => {
        expect(validateLocale(null)).toEqual([]);
    });
});

describe('validateProductOrderSlugs', () => {
    it('errors on empty slug strings', () => {
        const issues = validateProductOrderSlugs(['good-slug', '']);
        expect(issues.some((issue) => issue.severity === 'error')).toBe(true);
    });

    it('warns on duplicate slugs', () => {
        const issues = validateProductOrderSlugs(['a', 'b', 'a']);
        expect(issues.some((issue) => issue.message.includes('Duplicate'))).toBe(true);
    });

    it('warns when slug shape is unusual', () => {
        const issues = validateProductOrderSlugs(['UPPER-CASE']);
        expect(issues.some((issue) => issue.message.includes('unusual shape'))).toBe(true);
    });

    it('warns when slugs are missing from the catalog', () => {
        const catalogSlugs = new Set(['known-slug']);
        const issues = validateProductOrderSlugs(['known-slug', 'missing-slug'], {
            catalogSlugs,
        });
        expect(issues.some((issue) => issue.message.includes('not found in the catalog'))).toBe(
            true,
        );
    });

    it('warns on large catalogs when productOrder is set', () => {
        const issues = validateProductOrderSlugs(['one-slug'], { productCount: 250 });
        expect(issues.some((issue) => issue.message.includes('full catalog'))).toBe(true);
    });
});

describe('validateWixStoresV1ConfigValue', () => {
    it('combines locale and productOrder rules', () => {
        const issues = validateWixStoresV1ConfigValue({
            locale: '@bad',
            productOrder: [''],
        });
        expect(issues.filter((issue) => issue.severity === 'error').length).toBeGreaterThanOrEqual(
            2,
        );
    });
});
