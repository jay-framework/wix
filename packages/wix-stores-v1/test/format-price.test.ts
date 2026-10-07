// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { formatPrice } from '../lib/utils/format-price.js';

// he-IL ILS, as a Wix storefront renders it: RLM, amount, NBSP, RLM, sign.
const HE_IL_85 = '\u200f85.00\u00a0\u200f₪';

describe('formatPrice', () => {
    it('formats the amount with Intl in the configured locale, like a Wix storefront', () => {
        expect(formatPrice(85, 'ILS', 'he-IL', '85.00 ₪')).toBe(HE_IL_85);
        expect(formatPrice(85, 'ILS', 'he-il', '85.00 ₪')).toBe(HE_IL_85);
        expect(formatPrice(85, 'USD', 'en-US', '85.00 $')).toBe('$85.00');
        expect(formatPrice(85, 'EUR', 'de-DE', '€85.00')).toBe('85,00\u00a0€');
    });

    it("keeps the API's formatted text without a locale (the old behaviour) or a currency", () => {
        expect(formatPrice(85, 'ILS', null, '85.00 ₪')).toBe('85.00 ₪');
        expect(formatPrice(85, 'ILS', undefined, '85.00 ₪')).toBe('85.00 ₪');
        expect(formatPrice(85, undefined, 'he-IL', '85.00 ₪')).toBe('85.00 ₪');
    });

    it("falls back to the API's text for codes Intl rejects or no amount, and to '' with no text", () => {
        expect(formatPrice(10, 'NOT-A-CODE', 'en-US', '$10.00')).toBe('$10.00');
        expect(formatPrice(undefined, 'USD', 'en-US', '$10.00')).toBe('$10.00');
        expect(formatPrice(NaN, 'USD', 'en-US', '$10.00')).toBe('$10.00');
        expect(formatPrice(undefined, undefined, null, undefined)).toBe('');
    });
});
