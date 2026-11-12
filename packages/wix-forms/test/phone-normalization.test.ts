// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { checkPhone, type PhoneCheck } from '../lib/utils/phone-normalization.js';
import { FieldRule } from '../lib/components/field-rule.js';
import type { PhoneRules } from '../lib/types.js';

/**
 * Bug: the plugin posted phones as typed, and Wix's caller (visitor) path refuses every shape but
 *   compact E.164 (`054.123.4567`, `+972-54-123-4567` and `0541234567` were refused live).
 * Found in: design-log/55 - wix validation parity for wix-forms.md §1c (Q29–Q39), Implementation
 *   Results "Live check (2026-11-11)".
 * Expected: one verdict per value — the E.164 form to send, or PHONE / PHONE_COUNTRY.
 * Actual (before P1c): no normalization; dotted/local phones pass the browser and Wix refuses them.
 */

const NBSP = ' ';

function sends(e164: string): PhoneCheck {
    return { rule: FieldRule.NONE, e164 };
}
const PHONE: PhoneCheck = { rule: FieldRule.PHONE };
const PHONE_COUNTRY: PhoneCheck = { rule: FieldRule.PHONE_COUNTRY };

const cases: Array<[string, PhoneRules, PhoneCheck]> = [
    // no rules, separators
    ['+972-54-123-4567', {}, sends('+972541234567')],
    ['+972 (54) 123.4567', {}, sends('+972541234567')],
    [`+972${NBSP}54${NBSP}123${NBSP}4567`, {}, sends('+972541234567')],
    // no rules, 00
    ['00972541234567', {}, sends('+972541234567')],
    ['00 44 20 7946 0958', {}, sends('+442079460958')],
    // no rules, local
    ['0541234567', {}, PHONE_COUNTRY],
    ['054.123.4567', {}, PHONE_COUNTRY],
    ['(050) 123-4567', {}, PHONE_COUNTRY],
    // no rules, length boundary of step 4
    ['12345', {}, PHONE],
    ['123456', {}, PHONE_COUNTRY],
    ['123456789012345', {}, PHONE_COUNTRY],
    ['1234567890123456', {}, PHONE],
    // no rules, the 00 rewrite runs before the local branch (N4)
    ['0000000', {}, PHONE],
    // no rules, invalid
    ['12', {}, PHONE],
    ['.', {}, PHONE],
    ['---', {}, PHONE],
    ['+', {}, PHONE],
    ['+97212', {}, PHONE],
    ['abc', {}, PHONE],
    ['1-800-FLOWERS', {}, PHONE],
    ['*123#', {}, PHONE],
    ['+1 (555) 123-4567 ext 5', {}, PHONE],
    ['+972541234567x5', {}, PHONE],
    ['０５０１２３４５６７', {}, PHONE],
    // default country IL
    ['0541234567', { defaultCountry: 'IL' }, sends('+972541234567')],
    ['054.123.4567', { defaultCountry: 'IL' }, sends('+972541234567')],
    ['054 123 4567', { defaultCountry: 'IL' }, sends('+972541234567')],
    ['+12025550123', { defaultCountry: 'IL' }, sends('+12025550123')],
    ['00442079460958', { defaultCountry: 'IL' }, sends('+442079460958')],
    ['12345', { defaultCountry: 'IL' }, PHONE],
    // default country US: wrong-country guard (Q33)
    ['0541234567', { defaultCountry: 'US' }, PHONE],
    ['(202) 555-0123', { defaultCountry: 'US' }, sends('+12025550123')],
    // default country GB
    ['020 7946 0958', { defaultCountry: 'GB' }, sends('+442079460958')],
    // allowedCountries (Q34)
    ['+12025550123', { allowedCountries: ['IL'] }, PHONE_COUNTRY],
    ['+12025550123', { allowedCountries: ['CA'] }, PHONE_COUNTRY],
    ['+972541234567', { allowedCountries: ['IL'] }, sends('+972541234567')],
    ['+15551234567', { allowedCountries: ['US'] }, sends('+15551234567')],
    ['0541234567', { defaultCountry: 'IL', allowedCountries: ['US'] }, PHONE_COUNTRY],
];

describe('checkPhone (DL#55 P1c)', () => {
    it.each(cases)('should judge "%s" with rules %j', (value, rules, expected) => {
        expect(checkPhone(value, rules)).toEqual(expected);
    });

    it('should default to no rules', () => {
        expect(checkPhone('0541234567')).toEqual(PHONE_COUNTRY);
    });
});
