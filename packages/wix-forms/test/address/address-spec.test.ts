import { describe, expect, it, vi } from 'vitest';
import { ADDRESS_TEMPLATE_IDS } from '../../lib/address/address-countries.js';
import { resolveAddressSpec } from '../../lib/address/address-spec.js';
import { layoutOf, withLearnedFacts } from '../../lib/address/address-value.js';
import type { AddressFieldSpec, AddressSchemaFacts } from '../../lib/address/address-types.js';
import { projectFormFields } from '../../lib/utils/project-form-fields.js';
import {
    fixtureTemplates,
    IT_CODES,
    requiredAddressFacts,
    specOf,
} from '../support/address-fixtures.js';
import { rawFormFixture } from '../support/form-kinds.js';

function facts(overrides: Partial<AddressSchemaFacts>): AddressSchemaFacts {
    return { allowedCountries: [], partRequired: {}, showAddressLine2: false, ...overrides };
}

function codes(spec: AddressFieldSpec): string[] {
    return spec.countries.map((option) => option.value);
}

describe('A3: resolveAddressSpec', () => {
    it('booking-form.json facts → 247 countries, no initial country', () => {
        const spec = specOf(requiredAddressFacts());
        expect(spec.countries).toHaveLength(247);
        expect(spec.initialCountry).toBeUndefined();
    });

    it("['us','IL','IT','ZZ'] → US, IL, IT in en name order; ZZ dropped with a warning", () => {
        const warn = vi.fn();
        const spec = resolveAddressSpec(
            facts({ allowedCountries: ['us', 'IL', 'IT', 'ZZ'] }),
            fixtureTemplates(),
            { warn },
        );
        expect(spec).toHaveProperty('countries');
        expect((spec as AddressFieldSpec).countries).toEqual([
            { value: 'IL', label: 'Israel' },
            { value: 'IT', label: 'Italy' },
            { value: 'US', label: 'United States' },
        ]);
        expect(warn).toHaveBeenCalledWith(
            '[wix-forms] address: allowed country ZZ is not one Wix accepts; it is not offered.',
        );
    });

    it("['ZZ'] → unsupported", () => {
        expect(
            resolveAddressSpec(facts({ allowedCountries: ['ZZ'] }), fixtureTemplates(), {
                warn: () => {},
            }),
        ).toEqual({
            unsupported: 'no country Wix accepts',
        });
    });

    it('COUNTRY default US → initial US; BY_IP → none', () => {
        expect(
            specOf(facts({ defaultCountry: { type: 'COUNTRY', country: 'US' } })).initialCountry,
        ).toBe('US');
        expect(specOf(facts({ defaultCountry: { type: 'BY_IP' } })).initialCountry).toBeUndefined();
    });

    it('IL postalCode: required with the form override, optional without', () => {
        const postal = (spec: AddressFieldSpec) =>
            layoutOf(spec, 'IL')!.parts.find((part) => part.part === 'postalCode')!.required;
        expect(postal(specOf(facts({ partRequired: { postalCode: true } })))).toBe(true);
        expect(postal(specOf(facts({})))).toBe(false);
    });

    it('showAddressLine2 → addressLine2 in the US parts, optional', () => {
        const parts = layoutOf(specOf(facts({ showAddressLine2: true })), 'US')!.parts;
        expect(parts.map((part) => part.part)).toEqual([
            'addressLine',
            'addressLine2',
            'city',
            'subdivision',
            'postalCode',
        ]);
        expect(parts.find((part) => part.part === 'addressLine2')!.required).toBe(false);
    });

    it('has empty learned maps and a free-text Italian subdivision', () => {
        const spec = specOf(requiredAddressFacts());
        expect(spec.subdivisionsOf).toEqual({});
        expect(spec.revealedPartsOf).toEqual({});
        expect(spec.templateOf.IT).toBe(ADDRESS_TEMPLATE_IDS.MLA_COMMON_STATE);
        expect(layoutOf(spec, 'IT')!.subdivisions).toBeUndefined();
    });

    it('projectFormFields with learned facts → withLearnedFacts(base, sameFacts)', () => {
        const learnedFacts = {
            subdivisionsOf: { IT: IT_CODES.map((code) => ({ value: code, label: code })) },
        };
        const raw = rawFormFixture('booking-form');
        const base = projectFormFields(raw, {
            addressTemplates: fixtureTemplates(),
            warn: () => {},
        });
        const learned = projectFormFields(raw, {
            addressTemplates: fixtureTemplates(),
            learnedFacts,
            warn: () => {},
        });
        const addressOf = (projected: typeof base) =>
            projected.fields.find((field) => field.target === 'address')!.address!;
        expect(addressOf(learned)).toEqual(withLearnedFacts(addressOf(base), learnedFacts));
        expect(layoutOf(addressOf(learned), 'IT')!.subdivisions).toHaveLength(20);
    });

    it('throws when a form with an address is projected without templates', () => {
        expect(() => projectFormFields(rawFormFixture('booking-form'))).toThrow(
            'needs addressTemplates',
        );
    });
});
