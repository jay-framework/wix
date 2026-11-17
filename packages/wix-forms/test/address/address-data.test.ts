import { describe, expect, it, vi } from 'vitest';
import {
    ADDRESS_COUNTRY_CODES,
    ADDRESS_TEMPLATE_IDS,
    COMMON_TEMPLATE_ID,
    COUNTRY_TEMPLATE_IDS,
    UNMATCHED_COUNTRY_CODES,
} from '../../lib/address/address-countries.js';
import { SUBDIVISION_NAMES } from '../../lib/address/address-labels.js';
import { resolveAddressSpec } from '../../lib/address/address-spec.js';
// The L-drift probe's matcher (dev script): the table and the matcher cannot diverge.
import { layoutsByTemplateName, matchSignature } from '../../scripts/address-map-match.mjs';
import {
    addressFixture,
    fixtureTemplates,
    requiredAddressFacts,
    templatesResponse,
} from '../support/address-fixtures.js';

const map = addressFixture('country-template-map.json');
const LISTED = {
    US: 'MLA_US',
    GB: 'MLA_GB',
    CA: 'MLA_CA',
    DE: 'MLA_DE',
    JP: 'MLA_JP',
    BR: 'MLA_BR',
    FR: 'MLA_FR',
    ES: 'MLA_ES',
    AU: 'MLA_AU',
} as const;

describe('A2: address data tables', () => {
    it('ADDRESS_COUNTRY_CODES equals the 247 codes Wix accepts', () => {
        expect([...ADDRESS_COUNTRY_CODES]).toEqual(
            addressFixture('server-allowed-countries.json').countries,
        );
        expect(ADDRESS_COUNTRY_CODES).toHaveLength(247);
    });

    it('COUNTRY_TEMPLATE_IDS equals the probed map: 66 entries, none COMMON, all of the 12', () => {
        expect({ ...COUNTRY_TEMPLATE_IDS }).toEqual(map.countryTemplateIds);
        expect(Object.keys(COUNTRY_TEMPLATE_IDS)).toHaveLength(66);
        const ids = new Set(Object.values(ADDRESS_TEMPLATE_IDS));
        for (const id of Object.values(COUNTRY_TEMPLATE_IDS)) {
            expect(ids.has(id as any)).toBe(true);
            expect(id).not.toBe(COMMON_TEMPLATE_ID);
        }
    });

    it('re-matches every probed signature to its recorded template with the provenance rule', () => {
        const layouts = layoutsByTemplateName(templatesResponse(), ADDRESS_TEMPLATE_IDS);
        for (const [country, entry] of Object.entries<any>(map.perCountry)) {
            const { template, ...signature } = entry;
            expect({ country, matched: matchSignature(signature, layouts) }).toEqual({
                country,
                matched: [template],
            });
            const tableId = COUNTRY_TEMPLATE_IDS[country] ?? COMMON_TEMPLATE_ID;
            expect({ country, tableId }).toEqual({
                country,
                tableId: (ADDRESS_TEMPLATE_IDS as any)[template],
            });
        }
    });

    it('has no unmatched country today', () => {
        expect(map.unmatchedOrAmbiguous).toEqual({});
        expect(UNMATCHED_COUNTRY_CODES).toEqual([]);
    });

    it('does not offer, and warns about, a country listed as unmatched', () => {
        const warn = vi.fn();
        const spec = resolveAddressSpec(requiredAddressFacts(), fixtureTemplates(), {
            warn,
            unmatchedCountries: ['ZW'],
        });
        expect('countries' in spec && spec.countries.map((option) => option.value)).not.toContain(
            'ZW',
        );
        expect(warn).toHaveBeenCalledWith(
            '[wix-forms] address: country ZW has no verified address layout; it is not offered.',
        );
    });

    it.each(Object.entries(LISTED))(
        'SUBDIVISION_NAMES.%s has exactly the template codes',
        (country, name) => {
            const templateId = (ADDRESS_TEMPLATE_IDS as any)[name];
            const subdivision = fixtureTemplates()[templateId].fields.find(
                (field) => field.part === 'subdivision',
            )!;
            expect(Object.keys(SUBDIVISION_NAMES[country]).sort()).toEqual(
                [...subdivision.enumValues].sort(),
            );
        },
    );
});
