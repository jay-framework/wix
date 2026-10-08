// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    validateDefaultCategory,
    validateLocale,
    validateUrlTemplates,
    validateWixStoresConfigValue,
} from '../lib/validate-config.js';

describe('validateLocale', () => {
    it('accepts a valid BCP 47 locale tag', () => {
        expect(validateLocale('ja-JP')).toEqual([]);
    });

    it('reports an error for invalid locale characters', () => {
        const issues = validateLocale('@bad');
        expect(issues).toHaveLength(1);
        expect(issues[0]?.severity).toBe('error');
    });
});

describe('validateUrlTemplates', () => {
    it('requires {slug} in urls.product', () => {
        const issues = validateUrlTemplates({ product: '/products/', category: null });
        expect(
            issues.some((issue) => issue.severity === 'error' && issue.message.includes('{slug}')),
        ).toBe(true);
    });

    it('errors on unknown placeholders', () => {
        const issues = validateUrlTemplates({
            product: '/products/{slug}/{foo}',
            category: null,
        });
        expect(issues.some((issue) => issue.message.includes('unknown placeholders'))).toBe(true);
    });

    it('warns when product uses {category} without urls.category', () => {
        const issues = validateUrlTemplates({
            product: '/products/{category}/{slug}',
            category: null,
        });
        expect(issues.some((issue) => issue.severity === 'warning')).toBe(true);
    });
});

describe('validateDefaultCategory', () => {
    it('errors on empty defaultCategory', () => {
        const issues = validateDefaultCategory('');
        expect(issues[0]?.severity).toBe('error');
    });

    it('warns when slug is missing from the category tree', () => {
        const issues = validateDefaultCategory('missing', {
            categorySlugs: new Set(['towels']),
        });
        expect(issues.some((issue) => issue.message.includes('not found'))).toBe(true);
    });
});

describe('validateWixStoresConfigValue', () => {
    it('aggregates locale and URL issues', () => {
        const issues = validateWixStoresConfigValue({
            urls: { product: '/no-slug-here', category: null },
            defaultCategory: null,
            locale: '@bad',
        });
        expect(issues.filter((issue) => issue.severity === 'error').length).toBeGreaterThanOrEqual(
            2,
        );
    });
});
