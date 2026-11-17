/**
 * A Wix 400 on address parts → messages, learned facts and the drift log (DL #52 Q6, Q17, §3).
 * Server-only. Shared by bookings (Create Booking) and per-form (Create Submission): both key
 * located errors `<target>/<part>`.
 */

import type { FormFieldOptionView, FormFieldView } from '../types.js';
import { addressMessageFor, type LocatedViolation } from '../utils/located-violations.js';
import { addressErrorKey, layoutOf, readAddressValue, splitErrorKey } from './address-value.js';
import type { LearnedAddressFacts } from './learned-address-facts.js';
import { COMMON_TEMPLATE_ID } from './address-countries.js';
import { isLayoutPart, type AddressValue, type LayoutPart } from './address-types.js';

export interface AddressViolationsResult {
    /** Keyed `<target>/<part>` (or `<target>/country` for a part outside the eight). */
    fieldErrors: Record<string, string>;
    /** `<target>/subdivision` → the codes Wix accepts (Q6). */
    fieldOptions: Record<string, FormFieldOptionView[]>;
    /** target → parts Wix required that the layout hid (Q17). */
    revealedParts: Record<string, LayoutPart[]>;
    /** target → the submitted country the facts belong to (review m7). */
    factsCountry: Record<string, string>;
    /** Violations of keys this mapper did not handle (non-address targets). */
    unhandled: LocatedViolation[];
}

export interface AddressViolationsInput {
    violations: LocatedViolation[];
    /** The address fields, as projected for this submit (with the current learned facts). */
    fields: FormFieldView[];
    /** The submitted values, keyed by target. */
    values: Record<string, unknown>;
    facts: LearnedAddressFacts;
    log?: (message: string) => void;
}

const DRIFT_DOC =
    'See "Address drift" in @jay-framework/wix-forms docs/01-setup-and-troubleshooting.md.';
/** One drift line per process per key: one set per learned-facts store (one per process). */
const driftLoggedByStore = new WeakMap<LearnedAddressFacts, Set<string>>();

export function mapAddressViolations(input: AddressViolationsInput): AddressViolationsResult {
    const result: AddressViolationsResult = {
        fieldErrors: {},
        fieldOptions: {},
        revealedParts: {},
        factsCountry: {},
        unhandled: [],
    };
    for (const violation of input.violations) {
        const { target } = splitErrorKey(violation.key);
        const field = input.fields.find(
            (candidate) =>
                candidate.target === target || violation.key.startsWith(`${candidate.target}/`),
        );
        if (!field?.address) result.unhandled.push(violation);
        else mapOne(input, field, violation, result);
    }
    return result;
}

function mapOne(
    input: AddressViolationsInput,
    field: FormFieldView,
    violation: LocatedViolation,
    result: AddressViolationsResult,
): void {
    const value = readAddressValue(input.values[field.target]);
    const country = value.country?.trim().toUpperCase() ?? '';
    const { part } = splitErrorKey(violation.key);
    const drift = (key: string) =>
        logDrift(input, { key, ruleName: violation.ruleName, country, field, value });
    if (!part && violation.key !== field.target) {
        // A part outside the eight: the one dead end (Q17).
        const key = addressErrorKey(field.target, 'country');
        result.fieldErrors[key] ??= addressMessageFor(field, value, {
            ...violation,
            key,
            ruleName: 'UNKNOWN_VALUE_ERROR',
        });
        drift(violation.key);
        return;
    }
    result.fieldErrors[violation.key] ??= addressMessageFor(field, value, violation);
    if (!part || !country) return;
    const layout = layoutOf(field.address!, country);
    const isShown = Boolean(layout?.parts.some((candidate) => candidate.part === part));
    if (violation.ruleName === 'NOT_ALLOWED_VALUE_ERROR' && part === 'subdivision') {
        learnSubdivisions(
            input,
            field,
            country,
            violation,
            result,
            isTemplateListed(field, country),
            drift,
        );
    } else if (violation.ruleName === 'REQUIRED_VALUE_ERROR' && isLayoutPart(part) && !isShown) {
        input.facts.revealPart(country, part);
        result.revealedParts[field.target] = [...(result.revealedParts[field.target] ?? []), part];
        result.factsCountry[field.target] = country;
        drift(violation.key);
    } else if (violation.ruleName === 'UNKNOWN_VALUE_ERROR') {
        drift(violation.key);
    }
}

/** A NOT_ALLOWED on an unlisted subdivision is expected; on a listed one it is drift. */
function learnSubdivisions(
    input: AddressViolationsInput,
    field: FormFieldView,
    country: string,
    violation: LocatedViolation,
    result: AddressViolationsResult,
    isListed: boolean,
    drift: (key: string) => void,
): void {
    if (isListed) {
        drift(violation.key);
        return;
    }
    if (!violation.allowedValues?.length) return;
    input.facts.learnSubdivisions(country, violation.allowedValues);
    const learned = input.facts.snapshot().subdivisionsOf?.[country];
    if (!learned) return;
    result.fieldOptions[violation.key] = learned;
    result.factsCountry[field.target] = country;
}

/** The template itself lists the codes (US, GB, …), as opposed to a learned list. */
function isTemplateListed(field: FormFieldView, country: string): boolean {
    const spec = field.address!;
    const base = spec.layouts[spec.templateOf[country] ?? COMMON_TEMPLATE_ID];
    return Boolean(base?.subdivisions?.length);
}

interface DriftDetails {
    key: string;
    ruleName: string;
    country: string;
    field: FormFieldView;
    value: AddressValue;
}

/** Never logs a visitor value: the key, the rule, the country and the layout only. */
function logDrift(input: AddressViolationsInput, details: DriftDetails): void {
    const logged = driftLoggedByStore.get(input.facts) ?? new Set<string>();
    driftLoggedByStore.set(input.facts, logged);
    const identity = `${details.key}|${details.ruleName}|${details.country}`;
    if (logged.has(identity)) return;
    logged.add(identity);
    const templateId = layoutOf(details.field.address!, details.country)?.templateId ?? 'none';
    (input.log ?? console.warn)(
        `[wix-forms] address drift: Wix rejected ${details.key} (${details.ruleName}) for ${details.country || 'no country'}; layout ${templateId}. ${DRIFT_DOC}`,
    );
}
