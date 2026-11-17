import { describe, expect, it } from 'vitest';
import {
    addressMessageFor,
    parseBookingFormViolations,
    submissionLocatedViolations,
} from '../../lib/utils/located-violations.js';
import {
    addressFixture,
    addressFieldView,
    limitedAddressFacts,
    probeCase,
    probeErrors,
    sentAddress,
} from '../support/address-fixtures.js';

/** The documented message per LF0 400 case (DL #52 §3 `addressMessageFor`). */
const MESSAGES: Record<string, Record<string, string>> = {
    'address left out (required field)': { address: 'Address is required.' },
    'US missing subdivision': { 'address/subdivision': 'State is required.' },
    'US missing postalCode': { 'address/postalCode': 'Zip / Postal code is required.' },
    'US subdivision XX': { 'address/subdivision': 'Choose a State from the list.' },
    'US subdivision US-AL': { 'address/subdivision': 'Choose a State from the list.' },
    'US extra streetName': {
        'address/streetName':
            'This address cannot be accepted for United States. Please contact us.',
    },
    'unknown country ZZ': {
        'address/subdivision': 'This address cannot be accepted for ZZ. Please contact us.',
        'address/country': 'Choose a country from the list.',
    },
    'country only': {
        'address/addressLine': 'Address is required.',
        'address/city': 'City is required.',
        'address/subdivision': 'State is required.',
        'address/postalCode': 'Zip / Postal code is required.',
    },
    'no country, parts only': { 'address/country': 'Country/Region is required.' },
    'IL no postalCode': { 'address/postalCode': 'Zip / Postal code is required.' },
    'IL with addressLine': {
        'address/streetName': 'Street name is required.',
        'address/streetNumber': 'House number is required.',
        'address/addressLine': 'This address cannot be accepted for Israel. Please contact us.',
    },
    'IT (COMMON_STATE) subdivision MI': { 'address/subdivision': 'Choose a Region from the list.' },
    'IT subdivision XX': { 'address/subdivision': 'Choose a Region from the list.' },
    'IT no subdivision': { 'address/subdivision': 'Region is required.' },
    'FR subdivision FR-IDF': { 'address/subdivision': 'Choose a Region from the list.' },
    'ZW (COMMON) with subdivision': {
        'address/subdivision': 'This address cannot be accepted for Zimbabwe. Please contact us.',
    },
    'US postalCode 60 chars': { 'address/postalCode': 'Zip / Postal code is too long.' },
    'US addressLine 160 chars': {
        'address/addressLine': 'Address must be at most 150 characters.',
    },
    'limited: GB not in allowedCountries': {
        'address_limited/country': 'Choose a country from the list.',
    },
    'address as string': { address: 'Address: please check this value.' },
};

describe('A6: submissionLocatedViolations + addressMessageFor over every LF0 400', () => {
    const fields = [
        addressFieldView(),
        addressFieldView('address_limited', limitedAddressFacts(), false),
    ];

    it.each(Object.keys(MESSAGES))('%s', (name) => {
        const entry = probeCase(name);
        const violations = submissionLocatedViolations(JSON.stringify(entry.body));
        expect(violations.map(({ wixMessage, ...rest }) => rest)).toEqual(
            probeErrors(entry).map((error: any) => ({
                key: error.errorPath,
                ruleName: error.errorType,
                ...(error.params?.allowedValues
                    ? { allowedValues: error.params.allowedValues }
                    : {}),
            })),
        );
        const messages = Object.fromEntries(
            violations.map((violation) => {
                const field = fields.find(
                    (candidate) => violation.key.split('/')[0] === candidate.target,
                )!;
                const value =
                    typeof entry.sent[field.target] === 'object'
                        ? sentAddress(entry, field.target)
                        : {};
                return [violation.key, addressMessageFor(field, value, violation)];
            }),
        );
        expect(messages).toEqual(MESSAGES[name]);
    });

    it('a non-address key → "<field label>: please check this value."', () => {
        expect(
            addressMessageFor(
                { ...fields[0], label: 'Dropdown', target: 'dropdown_7b7d', address: undefined },
                {},
                { key: 'dropdown_7b7d', ruleName: 'NOT_ALLOWED_VALUE_ERROR' },
            ),
        ).toBe('Dropdown: please check this value.');
    });
});

describe('A7: parseBookingFormViolations', () => {
    const body = JSON.stringify(addressFixture('create-booking-400-dropdown.json').body);

    it('reads the F6 envelope', () => {
        expect(parseBookingFormViolations(body).map(({ wixMessage, ...rest }) => rest)).toEqual([
            {
                key: 'dropdown_7b7d',
                ruleName: 'NOT_ALLOWED_VALUE_ERROR',
                allowedValues: ['Option 1', 'Option 2'],
            },
        ]);
    });

    it('de-duplicates a violation repeated across fieldViolations entries', () => {
        const parsed = JSON.parse(body);
        const violations = parsed.details.validationError.fieldViolations;
        violations.push(structuredClone(violations[0]));
        expect(parseBookingFormViolations(JSON.stringify(parsed))).toHaveLength(1);
    });

    it("gives [] for '{}' and for bad JSON", () => {
        expect(parseBookingFormViolations('{}')).toEqual([]);
        expect(parseBookingFormViolations('not json')).toEqual([]);
    });
});
