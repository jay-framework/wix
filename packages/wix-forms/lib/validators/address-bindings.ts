/**
 * Rule 6 (DL #52 jay-feedback): an address must bind an input for every part, because any part
 * can be shown at runtime (another country, map drift, a revealed part). Shared by the wix-forms
 * per-form validator and the wix-bookings `booking-flow` validator. Pure.
 */

import type { JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { ADDRESS_PARTS, type AddressPart } from '../address/address-types.js';

/** The interactive children each part has: a select for country, both inputs for subdivision. */
const PART_INPUTS: Record<AddressPart, readonly string[]> = {
    country: ['input'],
    addressLine: ['input'],
    addressLine2: ['input'],
    streetName: ['input'],
    streetNumber: ['input'],
    city: ['input'],
    subdivision: ['input', 'text'],
    postalCode: ['input'],
};

const WHY =
    'Israel needs streetName and streetNumber; Italy needs subdivision.text; any country may need any part.';

/**
 * Findings for the `ref=` values under one address (`<prefix>` is `<key>.<addressTag>`): (a) a ref
 * to an unknown part or part child; (b) a part with an input left unbound.
 */
export function checkAddressBindings(
    refs: readonly string[],
    prefix: string,
): JayHtmlValidationFinding[] {
    const findings: JayHtmlValidationFinding[] = [];
    const bound = new Set<string>();
    for (const ref of refs) {
        if (!ref.startsWith(`${prefix}.`)) continue;
        const [part, child, ...rest] = ref.slice(prefix.length + 1).split('.');
        const inputs = PART_INPUTS[part as AddressPart];
        if (!inputs || !child || !inputs.includes(child) || rest.length) {
            findings.push(unknownRef(ref, prefix, part, inputs));
            continue;
        }
        bound.add(`${part}.${child}`);
    }
    for (const part of ADDRESS_PARTS) {
        const missing = PART_INPUTS[part].filter((child) => !bound.has(`${part}.${child}`));
        if (missing.length) findings.push(unboundPart(prefix, part, missing));
    }
    return findings;
}

function unknownRef(
    ref: string,
    prefix: string,
    part: string,
    inputs: readonly string[] | undefined,
): JayHtmlValidationFinding {
    const known = inputs
        ? `Part "${part}" binds ${inputs.map((child) => `"${child}"`).join(' and ')}.`
        : `The parts are ${ADDRESS_PARTS.join(', ')}.`;
    return {
        severity: 'error',
        message: `ref="${ref}" is not an address input: ${inputs ? 'unknown child' : 'unknown part'} under "${prefix}".`,
        suggestion: `${known} Bind values with {${prefix}.<part>.value}, not a ref.`,
        attribute: 'ref',
    };
}

function unboundPart(
    prefix: string,
    part: AddressPart,
    missing: string[],
): JayHtmlValidationFinding {
    const refs = missing.map((child) => `ref="${prefix}.${part}.${child}"`).join(' and ');
    return {
        severity: 'error',
        message: `The address "${prefix}" has no ${refs}: a visitor whose country needs ${part} could not fill it in.`,
        suggestion: `Add ${refs}, inside if="${prefix}.${part}.shown"${part === 'subdivision' ? ' (a <select> when listed, a text <input> when not)' : ''}. ${WHY}`,
        attribute: 'ref',
    };
}

/** True for a contract tag shaped like an address sub-contract. */
export function isAddressContractTag(tag: { tags?: Array<{ tag: string }> }): boolean {
    const children = new Set((tag.tags ?? []).map((child) => child.tag));
    return children.has('country') && children.has('subdivision') && children.has('postalCode');
}
