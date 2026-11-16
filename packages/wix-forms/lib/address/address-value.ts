/**
 * The address value and its spec (DL #52 §1). Pure and client-safe: the same functions shape the
 * view state, the store, the payload and validation on the server and in the browser.
 */

import type { FieldValue, FormFieldOptionView } from '../types.js';
import { COMMON_TEMPLATE_ID } from './address-countries.js';
import { addressMessages } from './address-messages.js';
import {
    ADDRESS_PARTS,
    isLayoutPart,
    type AddressFieldSpec,
    type AddressLayout,
    type AddressPart,
    type AddressPartSpec,
    type AddressValue,
    type CountryCode,
    type LayoutPart,
    type LearnedFactsSnapshot,
} from './address-types.js';

/** The layout a country uses, with its learned list and revealed parts; COMMON for an un-offered code. */
export function layoutOf(
    spec: AddressFieldSpec,
    country: string | undefined,
): AddressLayout | undefined {
    if (!country) return undefined;
    const base =
        spec.layouts[spec.templateOf[country] ?? COMMON_TEMPLATE_ID] ??
        spec.layouts[COMMON_TEMPLATE_ID];
    if (!base) return undefined;
    const withReveals = withRevealedParts(spec, base, spec.revealedPartsOf[country] ?? []);
    const learned = spec.subdivisionsOf[country];
    return learned && hasPart(withReveals, 'subdivision') && !withReveals.subdivisions?.length
        ? { ...withReveals, subdivisions: learned }
        : withReveals;
}

/** A revealed part joins in the fixed superset order: the template gives it no position (Q17). */
function withRevealedParts(
    spec: AddressFieldSpec,
    layout: AddressLayout,
    revealed: LayoutPart[],
): AddressLayout {
    const missing = revealed.filter((part) => !hasPart(layout, part));
    if (!missing.length) return layout;
    const parts = [...layout.parts];
    for (const part of missing) {
        const added: AddressPartSpec = { part, label: spec.partLabels[part], required: true };
        const order = ADDRESS_PARTS.indexOf(part);
        const before = parts.findIndex((existing) => ADDRESS_PARTS.indexOf(existing.part) > order);
        parts.splice(before === -1 ? parts.length : before, 0, added);
    }
    const subdivisionLabel = missing.includes('subdivision')
        ? spec.partLabels.subdivision
        : layout.subdivisionLabel;
    return { ...layout, parts, ...(subdivisionLabel ? { subdivisionLabel } : {}) };
}

function hasPart(layout: AddressLayout, part: LayoutPart): boolean {
    return layout.parts.some((spec) => spec.part === part);
}

/**
 * The one place learned facts enter a spec (§1 "One spec"). A list is kept only for an offered
 * country whose template lists no codes; a reveal only for an offered country. Never mutates.
 */
export function withLearnedFacts(
    spec: AddressFieldSpec,
    facts: LearnedFactsSnapshot,
): AddressFieldSpec {
    const offered = new Set(spec.countries.map((country) => country.value));
    const subdivisionsOf = { ...spec.subdivisionsOf };
    const revealedPartsOf = { ...spec.revealedPartsOf };
    let changed = false;
    for (const [country, options] of Object.entries(facts.subdivisionsOf ?? {})) {
        if (!offered.has(country) || !options?.length || isListedByTemplate(spec, country))
            continue;
        subdivisionsOf[country] = options;
        changed = true;
    }
    for (const [country, parts] of Object.entries(facts.revealedPartsOf ?? {})) {
        const known = (parts ?? []).filter(isLayoutPart);
        if (!offered.has(country) || !known.length) continue;
        revealedPartsOf[country] = [...new Set([...(revealedPartsOf[country] ?? []), ...known])];
        changed = true;
    }
    return changed ? { ...spec, subdivisionsOf, revealedPartsOf } : spec;
}

function isListedByTemplate(spec: AddressFieldSpec, country: CountryCode): boolean {
    const layout = spec.layouts[spec.templateOf[country] ?? COMMON_TEMPLATE_ID];
    return Boolean(layout?.subdivisions?.length);
}

/** The store value at form load: the preselected country, if any (Q9). */
export function initialAddressValue(spec: AddressFieldSpec): AddressValue {
    return spec.initialCountry ? { country: spec.initialCountry } : {};
}

/**
 * A country change keeps only the parts both layouts show (a value under a part the old layout
 * hid is stale), and a subdivision only if the new layout lists it.
 */
export function nextAddressValue(
    spec: AddressFieldSpec,
    current: AddressValue,
    part: AddressPart,
    value: string,
): AddressValue {
    if (part !== 'country' || value === current.country) return { ...current, [part]: value };
    const layout = layoutOf(spec, value);
    const previous = layoutOf(spec, current.country);
    const next: AddressValue = { country: value };
    for (const shown of layout?.parts ?? []) {
        const kept = current[shown.part];
        if (kept === undefined || (previous && !hasPart(previous, shown.part))) continue;
        if (shown.part === 'subdivision' && !isListed(layout!, kept)) continue;
        next[shown.part] = kept;
    }
    return next;
}

function isListed(layout: AddressLayout, code: string): boolean {
    return (layout.subdivisions ?? []).some((option) => option.value === code);
}

/** No non-empty part other than `country`: a preselected country alone is blank. */
export function isBlankAddress(value: AddressValue): boolean {
    return ADDRESS_PARTS.every((part) => part === 'country' || !value[part]?.trim());
}

/** The payload: the upper-cased country plus each shown part, trimmed and non-empty (§1). */
export function toWixAddress(
    spec: AddressFieldSpec,
    value: AddressValue,
): AddressValue | undefined {
    if (isBlankAddress(value) && !value.country?.trim()) return undefined;
    const country = value.country?.trim().toUpperCase();
    const payload: AddressValue = country ? { country } : {};
    for (const { part } of layoutOf(spec, country ?? '')?.parts ?? []) {
        const trimmed = value[part]?.trim();
        if (trimmed) payload[part] = trimmed;
    }
    if (!country) {
        for (const part of ADDRESS_PARTS) {
            const trimmed = value[part]?.trim();
            if (trimmed) payload[part] = trimmed;
        }
    }
    return payload;
}

/** Errors by part, at most one per part, in the documented order (§1 validate steps). */
export function validateAddressValue(
    spec: AddressFieldSpec,
    value: AddressValue | undefined,
    required: boolean,
): Partial<Record<AddressPart, string>> {
    const address = value ?? {};
    if (!required && isBlankAddress(address)) return {};
    const country = address.country?.trim().toUpperCase();
    if (!country) return { country: addressMessages.required(spec.partLabels.country) };
    if (!spec.countries.some((option) => option.value === country)) {
        return { country: addressMessages.countryNotOffered() };
    }
    const errors: Partial<Record<AddressPart, string>> = {};
    const layout = layoutOf(spec, country)!;
    const isLearnedList = Boolean(spec.subdivisionsOf[country]?.length);
    for (const partSpec of layout.parts) {
        const message = partError(
            layout,
            partSpec,
            address[partSpec.part]?.trim() ?? '',
            isLearnedList,
        );
        if (message) errors[partSpec.part] = message;
    }
    return errors;
}

/**
 * A required empty subdivision whose list was learned from Wix keeps Wix's wording ("Choose a
 * Region from the list.", Q6): the visitor typed a code and must now pick one.
 */
function partError(
    layout: AddressLayout,
    partSpec: AddressPartSpec,
    value: string,
    isLearnedList: boolean,
): string {
    if (!value && partSpec.required && partSpec.part === 'subdivision' && isLearnedList) {
        return addressMessages.notInList(layout.subdivisionLabel ?? partSpec.label);
    }
    if (!value) return partSpec.required ? addressMessages.required(partSpec.label) : '';
    if (partSpec.maxLength !== undefined && value.length > partSpec.maxLength) {
        return addressMessages.tooManyCharacters(partSpec.label, partSpec.maxLength);
    }
    if (partSpec.pattern && !matchesPattern(partSpec.pattern, value)) {
        return addressMessages.patternFailed(partSpec.label);
    }
    if (
        partSpec.part === 'subdivision' &&
        layout.subdivisions?.length &&
        !isListed(layout, value)
    ) {
        return addressMessages.notInList(layout.subdivisionLabel ?? partSpec.label);
    }
    return '';
}

function matchesPattern(pattern: string, value: string): boolean {
    try {
        return new RegExp(pattern).test(value);
    } catch {
        return true;
    }
}

/** Own string-valued part keys only; anything else (a string, an array, a number) reads as `{}`. */
export function readAddressValue(raw: unknown): AddressValue {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const value: AddressValue = {};
    for (const part of ADDRESS_PARTS) {
        const entry = Object.hasOwn(raw, part) ? (raw as Record<string, unknown>)[part] : undefined;
        if (typeof entry === 'string') value[part] = entry;
    }
    return value;
}

/** The shared located-error key, as both Wix APIs write it: `<target>/<part>`. */
export function addressErrorKey(target: string, part: AddressPart): string {
    return `${target}/${part}`;
}

/** `<target>/<part>` → its parts; a key with no known part is all target. */
export function splitErrorKey(key: string): { target: string; part?: AddressPart } {
    const slash = key.lastIndexOf('/');
    const part = key.slice(slash + 1);
    if (slash <= 0 || !(ADDRESS_PARTS as readonly string[]).includes(part)) return { target: key };
    return { target: key.slice(0, slash), part: part as AddressPart };
}

export function isAddressValue(value: FieldValue | undefined): value is AddressValue {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The display name of a country code; the code itself when none is known. */
export function countryNameOf(spec: AddressFieldSpec, country: string | undefined): string {
    const code = country?.toUpperCase() ?? '';
    return spec.countries.find((option) => option.value === code)?.label ?? code;
}

/** The options of a part, for the view state: countries, or a listed subdivision. */
export function subdivisionOptionsOf(layout: AddressLayout | undefined): FormFieldOptionView[] {
    return layout?.subdivisions ?? [];
}
