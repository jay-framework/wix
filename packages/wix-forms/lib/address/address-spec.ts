/**
 * Resolves an address field's spec from its Get Form facts and the templates (DL #52 §1). Server
 * side (it needs the fetched templates); fail-closed. Learned facts are never applied here: the
 * base spec has empty `subdivisionsOf` / `revealedPartsOf`, and `withLearnedFacts` adds them.
 */

import type { FormFieldOptionView } from '../types.js';
import {
    ADDRESS_COUNTRY_CODES,
    ADDRESS_TEMPLATE_IDS,
    COMMON_TEMPLATE_ID,
    COUNTRY_TEMPLATE_IDS,
    UNMATCHED_COUNTRY_CODES,
} from './address-countries.js';
import { resolveAddressLabels, type ResolvedAddressLabels } from './address-labels.js';
import type { AddressTemplates, RawAddressTemplate } from './address-templates.js';
import {
    ADDRESS_PARTS,
    type AddressConfig,
    type AddressFieldSpec,
    type AddressLayout,
    type AddressPart,
    type AddressPartSpec,
    type AddressSchemaFacts,
    type CountryCode,
} from './address-types.js';

/** The subdivision label of the shared unlisted template (MLA_COMMON_STATE), e.g. Italy. */
export const UNLISTED_SUBDIVISION_LABEL = 'Region';

export interface ResolveAddressSpecOptions {
    config?: AddressConfig;
    warn?: (message: string) => void;
    /** Countries with no verified layout; default: the fixture-derived list (empty today). */
    unmatchedCountries?: readonly CountryCode[];
}

export function resolveAddressSpec(
    facts: AddressSchemaFacts,
    templates: AddressTemplates,
    options: ResolveAddressSpecOptions = {},
): AddressFieldSpec | { unsupported: string } {
    const warn = options.warn ?? ((message: string) => console.warn(message));
    const labels = resolveAddressLabels(options.config?.labels);
    const offered = offeredCountries(
        facts,
        options.unmatchedCountries ?? UNMATCHED_COUNTRY_CODES,
        warn,
    );
    if (!offered.length) return { unsupported: 'no country Wix accepts' };

    const templateOf: Record<CountryCode, string> = {};
    for (const country of offered) {
        const templateId = COUNTRY_TEMPLATE_IDS[country];
        if (templateId) templateOf[country] = templateId;
    }
    const usedTemplateIds = new Set([COMMON_TEMPLATE_ID, ...Object.values(templateOf)]);
    const layouts: Record<string, AddressLayout> = {};
    for (const templateId of usedTemplateIds) {
        layouts[templateId] = layoutFrom(templates[templateId], facts, labels);
    }
    const initialCountry = initialCountryOf(facts, offered);
    return {
        countries: countryOptions(offered, options.config?.locale ?? 'en'),
        ...(initialCountry ? { initialCountry } : {}),
        layouts,
        templateOf,
        subdivisionsOf: {},
        revealedPartsOf: {},
        partLabels: Object.fromEntries(
            ADDRESS_PARTS.map((part) => [part, labels.partLabel(part)]),
        ) as Record<AddressPart, string>,
    };
}

/** `ADDRESS_COUNTRY_CODES ∩ allowedCountries` (all when empty), minus unverified countries (Q4). */
function offeredCountries(
    facts: AddressSchemaFacts,
    unmatched: readonly CountryCode[],
    warn: (message: string) => void,
): CountryCode[] {
    const accepted = new Set(ADDRESS_COUNTRY_CODES);
    const requested = facts.allowedCountries.length
        ? [...new Set(facts.allowedCountries.map((code) => String(code).trim().toUpperCase()))]
        : [...ADDRESS_COUNTRY_CODES];
    return requested.filter((country) => {
        if (!accepted.has(country)) {
            warn(
                `[wix-forms] address: allowed country ${country} is not one Wix accepts; it is not offered.`,
            );
            return false;
        }
        if (unmatched.includes(country)) {
            warn(
                `[wix-forms] address: country ${country} has no verified address layout; it is not offered.`,
            );
            return false;
        }
        return true;
    });
}

/**
 * Shown parts in template order, plus `addressLine2` when the form shows it. A part's `required`
 * is the form's override, else the template's. `addressLine2`'s override counts only when the
 * form itself shows the line: Wix accepted a booking without it on a form whose override says
 * required while the line was hidden (IL template shows it; implementation note in DL #52).
 */
function layoutFrom(
    template: RawAddressTemplate | undefined,
    facts: AddressSchemaFacts,
    labels: ResolvedAddressLabels,
): AddressLayout {
    if (!template) throw new Error('address templates were loaded without a used template');
    const country = soleCountryOf(template.id);
    const parts: AddressPartSpec[] = [];
    let subdivisions: FormFieldOptionView[] | undefined;
    for (const field of template.fields) {
        const showsLine2 = field.part === 'addressLine2' && facts.showAddressLine2;
        if (field.hidden && !showsLine2) continue;
        const override =
            field.part === 'addressLine2' && !showsLine2
                ? undefined
                : facts.partRequired[field.part];
        parts.push({
            part: field.part,
            label:
                field.part === 'subdivision'
                    ? subdivisionLabelOf(country, labels)
                    : labels.partLabel(field.part),
            required: override ?? field.required,
            ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
            ...(field.pattern !== undefined ? { pattern: field.pattern } : {}),
        });
        if (field.part === 'subdivision' && field.enumValues.length && country) {
            subdivisions = field.enumValues.map((code) => ({
                value: code,
                label: labels.subdivisionName(country, code),
            }));
        }
    }
    const hasSubdivision = parts.some((part) => part.part === 'subdivision');
    return {
        templateId: template.id,
        parts,
        ...(hasSubdivision ? { subdivisionLabel: subdivisionLabelOf(country, labels) } : {}),
        ...(subdivisions ? { subdivisions } : {}),
    };
}

/** The one country of an own-country template (MLA_US → US); undefined for the shared ones. */
function soleCountryOf(templateId: string): CountryCode | undefined {
    if (templateId === COMMON_TEMPLATE_ID || templateId === ADDRESS_TEMPLATE_IDS.MLA_COMMON_STATE) {
        return undefined;
    }
    return Object.keys(COUNTRY_TEMPLATE_IDS).find(
        (code) => COUNTRY_TEMPLATE_IDS[code] === templateId,
    );
}

function subdivisionLabelOf(
    country: CountryCode | undefined,
    labels: ResolvedAddressLabels,
): string {
    return country ? labels.subdivisionPartLabel(country) : UNLISTED_SUBDIVISION_LABEL;
}

/** Q9: an offered COUNTRY default, else a single offered country; BY_IP preselects nothing. */
function initialCountryOf(
    facts: AddressSchemaFacts,
    offered: CountryCode[],
): CountryCode | undefined {
    const configured = facts.defaultCountry?.country?.trim().toUpperCase();
    if (facts.defaultCountry?.type === 'COUNTRY' && configured && offered.includes(configured)) {
        return configured;
    }
    return offered.length === 1 ? offered[0] : undefined;
}

/** Ordered by display name in `locale`; a code with no name shows the code. */
function countryOptions(codes: CountryCode[], locale: string): FormFieldOptionView[] {
    const names = displayNamesFor(locale);
    return codes
        .map((code) => ({ value: code, label: names(code) }))
        .sort((first, second) => first.label.localeCompare(second.label, locale));
}

function displayNamesFor(locale: string): (code: string) => string {
    let displayNames: Intl.DisplayNames | undefined;
    try {
        displayNames = new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
        displayNames = undefined;
    }
    return (code) => {
        try {
            return displayNames?.of(code) ?? code;
        } catch {
            return code;
        }
    };
}
