/**
 * Located errors from both Wix envelopes, keyed `<target>` or `<target>/<part>` (DL #52 §3), and
 * the one mapper from a violation to a visitor message. The parsers are server-side (the raw Wix
 * body never leaves the server); `addressMessageFor` is client-safe.
 */

import type { AddressValue } from '../address/address-types.js';
import { addressMessages } from '../address/address-messages.js';
import { countryNameOf, layoutOf, splitErrorKey } from '../address/address-value.js';
import type { FormFieldView } from '../types.js';

export interface LocatedViolation {
    key: string;
    ruleName: string;
    allowedValues?: string[];
    wixMessage?: string;
}

interface BookingFormViolation {
    fieldName?: string;
    ruleName?: string;
    description?: string;
    data?: { allowedValues?: unknown[] };
}

interface SubmissionError {
    errorPath?: string;
    errorType?: string;
    errorMessage?: string;
    params?: { allowedValues?: unknown[] };
}

interface ViolationEnvelope<Item> {
    details?: {
        validationError?: {
            fieldViolations?: Array<{
                data?: { formViolations?: Item[]; errors?: Item[] };
            }>;
        };
    };
}

/** Create Booking: `fieldViolations[].data.formViolations[]`, de-duplicated by key + rule. */
export function parseBookingFormViolations(responseBody: string): LocatedViolation[] {
    const items = envelopeItems<BookingFormViolation>(responseBody, 'formViolations');
    return uniqueViolations(
        items.map((item) =>
            locatedViolation(
                item.fieldName,
                item.ruleName,
                item.data?.allowedValues,
                item.description,
            ),
        ),
    );
}

/** Create Submission: `fieldViolations[].data.errors[]`, de-duplicated by key + rule. */
export function submissionLocatedViolations(responseBody: string): LocatedViolation[] {
    const items = envelopeItems<SubmissionError>(responseBody, 'errors');
    return uniqueViolations(
        items.map((item) =>
            locatedViolation(
                item.errorPath,
                item.errorType,
                item.params?.allowedValues,
                item.errorMessage,
            ),
        ),
    );
}

function envelopeItems<Item>(responseBody: string, member: 'formViolations' | 'errors'): Item[] {
    try {
        const parsed = JSON.parse(responseBody) as ViolationEnvelope<Item>;
        const fieldViolations = parsed?.details?.validationError?.fieldViolations ?? [];
        return fieldViolations.flatMap((violation) => violation?.data?.[member] ?? []);
    } catch {
        return [];
    }
}

function locatedViolation(
    key: string | undefined,
    ruleName: string | undefined,
    allowedValues: unknown[] | undefined,
    wixMessage: string | undefined,
): LocatedViolation | undefined {
    if (!key) return undefined;
    const codes = (allowedValues ?? []).filter(
        (value): value is string => typeof value === 'string',
    );
    return {
        key,
        ruleName: ruleName ?? '',
        ...(allowedValues ? { allowedValues: codes } : {}),
        ...(wixMessage ? { wixMessage } : {}),
    };
}

function uniqueViolations(items: Array<LocatedViolation | undefined>): LocatedViolation[] {
    const seen = new Set<string>();
    const unique: LocatedViolation[] = [];
    for (const item of items) {
        if (!item) continue;
        const identity = `${item.key}\u0000${item.ruleName}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        unique.push(item);
    }
    return unique;
}

/** The visitor message for a violation of `field` (DL #52 §3 `addressMessageFor`). */
export function addressMessageFor(
    field: FormFieldView,
    value: AddressValue,
    violation: LocatedViolation,
): string {
    const { target, part } = splitErrorKey(violation.key);
    if (target !== field.target || !field.address) return addressMessages.checkValue(field.label);
    if (!part) {
        return violation.ruleName === 'REQUIRED_VALUE_ERROR'
            ? addressMessages.required(field.label)
            : addressMessages.checkValue(field.label);
    }
    const spec = field.address;
    const layout = layoutOf(spec, value.country?.toUpperCase());
    const partSpec = layout?.parts.find((candidate) => candidate.part === part);
    const label = partSpec?.label ?? spec.partLabels[part];
    switch (violation.ruleName) {
        case 'REQUIRED_VALUE_ERROR':
            return addressMessages.required(label);
        case 'NOT_ALLOWED_VALUE_ERROR':
            if (part === 'country') return addressMessages.countryNotOffered();
            return addressMessages.notInList(
                part === 'subdivision' ? (layout?.subdivisionLabel ?? label) : label,
            );
        case 'MAX_LENGTH_ERROR':
            return partSpec?.maxLength === undefined
                ? addressMessages.checkValue(label)
                : addressMessages.tooManyCharacters(label, partSpec.maxLength);
        case 'INVALID_VALUE_FOR_PATTERN_ERROR':
            return addressMessages.patternFailed(label);
        case 'UNKNOWN_VALUE_ERROR':
            return addressMessages.cannotAccept(countryNameOf(spec, value.country));
        default:
            return addressMessages.checkValue(label);
    }
}
