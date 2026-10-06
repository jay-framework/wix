// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { formatPrice } from '../lib/utils/format-price.js';

describe('formatPrice', () => {
    it('formats the amount in the configured locale, like a Wix storefront', () => {
        expect(formatPrice({ amount: '400', formattedAmount: '¥400' }, 'JPY', 'ja-JP')).toBe(
            '￥400',
        );
        expect(formatPrice({ amount: '85', formattedAmount: '₪85.00' }, 'ILS', 'he-IL')).toBe(
            '‏85.00 ‏₪',
        );
        expect(formatPrice({ amount: '85', formattedAmount: '€85.00' }, 'EUR', 'de-DE')).toBe(
            '85,00 €',
        );
    });

    it("keeps the API's formattedAmount without a locale or currency", () => {
        expect(formatPrice({ amount: '400', formattedAmount: '¥400' }, 'JPY', null)).toBe('¥400');
        expect(formatPrice({ amount: '400', formattedAmount: '¥400' }, undefined, 'ja-JP')).toBe(
            '¥400',
        );
    });

    it("falls back to the API's text for codes Intl rejects, and to '' with no price", () => {
        expect(
            formatPrice({ amount: '10', formattedAmount: '$10.00' }, 'NOT-A-CODE', 'en-US'),
        ).toBe('$10.00');
        expect(formatPrice(undefined, 'USD', 'en-US')).toBe('');
        expect(formatPrice({ amount: '', formattedAmount: '' }, 'USD', 'en-US')).toBe('');
    });
});
