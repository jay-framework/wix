import { describe, expect, it } from 'vitest';
import {
    isBlankAddress,
    layoutOf,
    nextAddressValue,
    toWixAddress,
    validateAddressValue,
    withLearnedFacts,
} from '../../lib/address/address-value.js';
import { fieldErrorsOf } from '../../lib/utils/project-form-fields.js';
import {
    addressFieldView,
    IT_CODES,
    limitedAddressFacts,
    probeCase,
    probeErrors,
    requiredAddressFacts,
    sentAddress,
    specOf,
} from '../support/address-fixtures.js';

const spec = () => specOf(requiredAddressFacts());
const itOptions = IT_CODES.map((code) => ({ value: code, label: code }));

describe('A4: toWixAddress over the accepted Create Submission cases', () => {
    it.each([
        'US valid',
        'IL valid street',
        'IL with addressLine2',
        'FR subdivision IDF',
        'ZW (COMMON) no subdivision',
    ])('%s, with an unrelated part added, gives what Wix accepted', (name) => {
        const entry = probeCase(name);
        expect(entry.status).toBe(200);
        const unrelated =
            sentAddress(entry).country === 'IL'
                ? { addressLine: 'left over' }
                : { streetName: 'left over' };
        expect(toWixAddress(spec(), { ...sentAddress(entry), ...unrelated })).toEqual(
            sentAddress(entry),
        );
    });

    it("upper-cases 'us', keeps an un-offered country, and gives undefined for a blank value", () => {
        expect(toWixAddress(spec(), { country: 'us', city: ' Montgomery ' })).toEqual({
            country: 'US',
            city: 'Montgomery',
        });
        expect(
            toWixAddress(specOf(limitedAddressFacts()), { country: 'FR', city: 'Paris' }),
        ).toEqual({ country: 'FR', city: 'Paris' });
        expect(toWixAddress(spec(), {})).toBeUndefined();
        expect(toWixAddress(spec(), { city: '  ' })).toBeUndefined();
    });
});

describe('A5: client validation finds what Wix rejected', () => {
    const field = addressFieldView();
    const limited = addressFieldView('address_limited', limitedAddressFacts(), false);

    it.each([
        'US missing subdivision',
        'US missing postalCode',
        'US subdivision XX',
        'US subdivision US-AL',
        'no country, parts only',
        'IL no postalCode',
        'IL with addressLine',
        'IT no subdivision',
        'FR subdivision FR-IDF',
        'US postalCode 60 chars',
        'US addressLine 160 chars',
    ])('%s → errors on the parts Wix located (normalised parts excluded)', (name) => {
        const entry = probeCase(name);
        const expected = probeErrors(entry)
            .filter((error) => error.errorType !== 'UNKNOWN_VALUE_ERROR')
            .map((error) => error.errorPath)
            .sort();
        expect(Object.keys(fieldErrorsOf(field, sentAddress(entry))).sort()).toEqual(expected);
    });

    it('country only (a preselected-style value) → the four required parts and no country error', () => {
        const entry = probeCase('country only');
        expect(Object.keys(fieldErrorsOf(field, sentAddress(entry))).sort()).toEqual([
            'address/addressLine',
            'address/city',
            'address/postalCode',
            'address/subdivision',
        ]);
    });

    it('limited field, GB → address_limited/country "Choose a country from the list."', () => {
        const entry = probeCase('limited: GB not in allowedCountries');
        expect(fieldErrorsOf(limited, sentAddress(entry, 'address_limited'))).toEqual({
            'address_limited/country': 'Choose a country from the list.',
        });
        expect(probeErrors(entry).map((error) => error.errorPath)).toEqual([
            'address_limited/country',
        ]);
    });

    it('US + streetName and ZW + subdivision normalise to accepted shapes', () => {
        expect(toWixAddress(spec(), sentAddress(probeCase('US extra streetName')))).toEqual(
            sentAddress(probeCase('US valid')),
        );
        expect(
            toWixAddress(spec(), sentAddress(probeCase('ZW (COMMON) with subdivision'))),
        ).toEqual(sentAddress(probeCase('ZW (COMMON) no subdivision')));
    });

    it('documents the messages', () => {
        expect(
            fieldErrorsOf(field, {
                country: 'US',
                addressLine: 'x'.repeat(160),
                city: 'M',
                subdivision: 'XX',
                postalCode: 'y'.repeat(60),
            }),
        ).toEqual({
            'address/addressLine': 'Address must be at most 150 characters.',
            'address/subdivision': 'Choose a State from the list.',
            'address/postalCode': 'Zip / Postal code is too long.',
        });
        expect(fieldErrorsOf(field, { city: 'x' })).toEqual({
            'address/country': 'Country/Region is required.',
        });
        expect(validateAddressValue(spec(), undefined, false)).toEqual({});
        expect(validateAddressValue(spec(), { country: 'US' }, false)).toEqual({});
    });
});

describe('A9: nextAddressValue on a country change', () => {
    it('US → IL clears subdivision, addressLine and the hidden addressLine2', () => {
        const us = {
            country: 'US',
            addressLine: '600 Dexter Ave',
            addressLine2: 'x',
            city: 'Montgomery',
            subdivision: 'AL',
            postalCode: '36104',
        };
        expect(nextAddressValue(spec(), us, 'country', 'IL')).toEqual({
            country: 'IL',
            city: 'Montgomery',
            postalCode: '36104',
        });
    });

    it('IL → US clears the street parts', () => {
        const il = {
            country: 'IL',
            streetName: 'Herzl',
            streetNumber: '1',
            addressLine2: 'Apt 4',
            city: 'Tel Aviv',
            postalCode: '6100000',
        };
        expect(nextAddressValue(spec(), il, 'country', 'US')).toEqual({
            country: 'US',
            city: 'Tel Aviv',
            postalCode: '6100000',
        });
    });

    it('sets any other part as typed, and blank-ness ignores the country', () => {
        expect(nextAddressValue(spec(), { country: 'US' }, 'city', 'M')).toEqual({
            country: 'US',
            city: 'M',
        });
        expect(isBlankAddress({ country: 'US' })).toBe(true);
    });
});

describe('A11: withLearnedFacts', () => {
    it('turns IT into a listed subdivision without mutating the input', () => {
        const base = spec();
        const before = JSON.stringify(base);
        const learned = withLearnedFacts(base, { subdivisionsOf: { IT: itOptions } });
        expect(layoutOf(learned, 'IT')!.subdivisions).toEqual(itOptions);
        expect(JSON.stringify(base)).toBe(before);
        expect(
            validateAddressValue(
                learned,
                {
                    country: 'IT',
                    addressLine: 'Via Roma 1',
                    city: 'Milano',
                    subdivision: 'MI',
                    postalCode: '20100',
                },
                true,
            ),
        ).toEqual({
            subdivision: 'Choose a Region from the list.',
        });
    });

    it('ignores a list for a listed country (US) or an un-offered one', () => {
        const base = specOf(limitedAddressFacts());
        expect(withLearnedFacts(base, { subdivisionsOf: { US: itOptions, FR: itOptions } })).toBe(
            base,
        );
    });

    it('reveals ZW subdivision: shown, required, free text, after city; sent and validated', () => {
        const learned = withLearnedFacts(spec(), { revealedPartsOf: { ZW: ['subdivision'] } });
        const layout = layoutOf(learned, 'ZW')!;
        expect(layout.parts.map((part) => part.part)).toEqual([
            'addressLine',
            'city',
            'subdivision',
            'postalCode',
        ]);
        expect(layout.parts[2]).toMatchObject({ required: true });
        expect(layout.subdivisions).toBeUndefined();
        const zw = { country: 'ZW', addressLine: '1 st', city: 'Harare', postalCode: '0000' };
        expect(toWixAddress(learned, { ...zw, subdivision: 'HA' })).toEqual({
            ...zw,
            subdivision: 'HA',
        });
        expect(validateAddressValue(learned, zw, true)).toEqual({
            subdivision: 'State/Region is required.',
        });
    });
});
