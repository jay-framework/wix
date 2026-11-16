import type { RawForm, RawFormField } from '../wix-apis/get-form.js';
import type { FormSummaryField } from '../wix-apis/get-form-summary.js';
import type {
    FieldValue,
    FormFieldInputType,
    FormFieldSummaryView,
    FormFieldView,
    ProjectedForm,
    UnsupportedFieldView,
} from '../types.js';
import {
    classifyFormField,
    componentOptionsOf,
    ignoreReasonOf,
    readFieldKey,
    wixKindOf,
    type FieldKey,
} from './classify-form-field.js';
import { readFieldView } from './read-field-view.js';
import { FieldRule, type FieldCheckResult } from '../components/field-rule.js';
import { callingCodesOf, checkPhone } from './phone-normalization.js';

const SUMMARY_FIELD_TYPES = new Set(['STRING', 'EMAIL', 'PHONE', 'NUMBER', 'URL']);

/** Site-level options for projecting a form for submission (DL#55 P1c). */
export interface ProjectionOptions {
    /** Config `defaultPhoneCountry`: the country of phones typed without a country code. */
    defaultPhoneCountry?: string;
}

/**
 * Per-form projection (DL #51 §1): every targeted input is either rendered (`fields`) or
 * listed as unsupported, in the form's layout order. Only `formFields[]` is read.
 */
export function projectFormFields(
    rawForm: RawForm,
    options: ProjectionOptions = {},
): ProjectedForm<FormFieldView> {
    const projected: ProjectedForm<FormFieldView> = { fields: [], unsupportedFields: [] };
    for (const raw of inLayoutOrder(rawForm)) {
        const key = readFieldKey(raw);
        if (ignoreReasonOf(key)) continue;
        const inputType = classifyFormField(key);
        if (!inputType) {
            projected.unsupportedFields.push(unsupportedFieldOf(key));
            continue;
        }
        projected.fields.push({
            target: key.target!,
            label: key.label,
            inputType,
            required: key.required,
            ...readFieldView(raw, key),
            // DL#41 4a: hidden fields are MARKED, not dropped, so a page can fill them via `control`.
            hidden: key.hidden,
            ...phoneRulesOf(raw, inputType, options),
        });
    }
    return projected;
}

/**
 * `phone` only on tel fields, and only when a rule is known (DL#55 P1c). A Wix Phone field's own
 * default country wins over config `defaultPhoneCountry`. Read from `formFields[]` (DL #51), whose
 * `phoneInputOptions.defaultCountryCode` / `stringOptions.validation.phoneOptions` mirror the
 * legacy paths DL#55 captured (DL#55 Gap 2).
 */
function phoneRulesOf(
    raw: RawFormField,
    inputType: FormFieldInputType,
    { defaultPhoneCountry }: ProjectionOptions,
): Pick<FormFieldView, 'phone'> {
    if (inputType !== 'tel') return {};
    const defaultCountry = componentOptionsOf(raw)?.defaultCountryCode || defaultPhoneCountry;
    const allowedCountries =
        raw.inputOptions?.stringOptions?.validation?.phoneOptions?.allowedCountryCodes ?? [];
    const phone = {
        ...(defaultCountry ? { defaultCountry } : {}),
        ...(allowedCountries.length ? { allowedCountries } : {}),
    };
    return Object.keys(phone).length ? { phone } : {};
}

/** Labels of required inputs with no target (DL #51 row 2): Wix requires them, nothing can send them. */
export function requiredUntargetedLabels(rawForm: RawForm): string[] {
    return (rawForm.formFields ?? [])
        .map(readFieldKey)
        .filter((key) => key.required && ignoreReasonOf(key) === 'no-target')
        .map((key) => key.label);
}

export function unsupportedFieldOf(key: FieldKey): UnsupportedFieldView {
    return {
        target: key.target!,
        label: key.label,
        wixKind: wixKindOf(key),
        required: key.required,
    };
}

/**
 * `formFields[]` in `steps[0].layout.large.items` order (row, then column). Layout items for
 * ids outside `formFields[]` are skipped; fields without a layout item come last.
 */
export function inLayoutOrder(rawForm: RawForm): RawFormField[] {
    const fields = rawForm.formFields ?? [];
    const items = [...(rawForm.steps?.[0]?.layout?.large?.items ?? [])].sort(
        (first, second) =>
            (first.row ?? 0) - (second.row ?? 0) || (first.column ?? 0) - (second.column ?? 0),
    );
    const byId = new Map(fields.map((field) => [field.id, field]));
    const placed = new Set(items.flatMap((item) => byId.get(item.fieldId) ?? []));
    return [...placed, ...fields.filter((field) => !placed.has(field))];
}

/**
 * @deprecated Since DL #51 (Phase 1b): the Summary API has no `required`; bookings reads Get Form.
 * Kept types are rendered as before; any other targeted field is listed as unsupported.
 */
export function projectFormSummaryFields(
    fields: FormSummaryField[] | undefined,
    { defaultPhoneCountry }: ProjectionOptions = {},
): ProjectedForm<FormFieldSummaryView> {
    const projected: ProjectedForm<FormFieldSummaryView> = { fields: [], unsupportedFields: [] };
    for (const field of fields ?? []) {
        if (field.deleted || !field.target) continue;
        const label = field.label ?? field.target;
        if (field.type && SUMMARY_FIELD_TYPES.has(field.type)) {
            projected.fields.push({
                target: field.target,
                label,
                type: field.type as FormFieldSummaryView['type'],
                required: Boolean(field.required),
                ...(field.type === 'PHONE' && defaultPhoneCountry
                    ? { phone: { defaultCountry: defaultPhoneCountry } }
                    : {}),
            });
        } else {
            projected.unsupportedFields.push({
                target: field.target,
                label,
                wixKind: field.type ?? '?',
                required: 'unknown',
            });
        }
    }
    return projected;
}

/** @deprecated Since DL #51 (Phase 1b): use `validateFormField`. */
export function validateFormSummaryField(field: FormFieldSummaryView, value: string): string {
    const trimmed = (value ?? '').trim();
    if (field.required && !trimmed) {
        return `${field.label} is required.`;
    }
    if (!trimmed) {
        return '';
    }
    if (field.type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return 'Please enter a valid email address.';
    }
    if (field.type === 'URL' && !/^https?:\/\/.+/.test(trimmed)) {
        return 'Please enter a valid URL.';
    }
    if (field.type === 'PHONE') {
        return summaryPhoneMessage(field, trimmed);
    }
    if (field.type === 'NUMBER' && !/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return 'Please enter a valid number.';
    }
    return '';
}

/** The default (English) message of the first built-in rule `value` fails; '' when valid. */
export function validateFormField(field: FormFieldView, value: FieldValue): string {
    return checkFormField(field, value).message;
}

/** The first built-in (Wix schema) rule `value` fails, with its default message (DL#53 G1). */
export function checkFormField(field: FormFieldView, value: FieldValue): FieldCheckResult {
    // Non-string kinds (DL#41 4c): required means checked (boolean) / non-empty (array);
    // the string format/length/regex rules below apply only to string values.
    if (field.inputType === 'checkbox') {
        return field.required && value !== true ? requiredFailure(field) : PASSED;
    }
    if (field.inputType === 'multiselect') {
        const empty = !Array.isArray(value) || value.length === 0;
        return field.required && empty ? requiredFailure(field) : PASSED;
    }

    const trimmed = (typeof value === 'string' ? value : '').trim();
    if (field.required && !trimmed) {
        return requiredFailure(field);
    }
    if (!trimmed) {
        return PASSED;
    }
    return checkTextRules(field, trimmed);
}

const PASSED: FieldCheckResult = { rule: FieldRule.NONE, message: '' };

function requiredFailure(field: FormFieldView): FieldCheckResult {
    return failure(FieldRule.REQUIRED, field);
}

/** A failed rule with its default message; only for rules `defaultFieldMessage` can fill. */
function failure(rule: FieldRule, field: FormFieldView): FieldCheckResult {
    return { rule, message: defaultFieldMessage(rule, field) ?? '' };
}

/**
 * The default (English) message of a rule, whoever caught it (DL#55 P2). undefined when it
 * cannot be filled (a length rule without its bound) and for NONE / CUSTOM / SERVER.
 */
export function defaultFieldMessage(rule: FieldRule, field: FormFieldView): string | undefined {
    switch (rule) {
        case FieldRule.REQUIRED:
            return `${field.label} is required.`;
        case FieldRule.MIN_LENGTH:
            return field.minLength === undefined
                ? undefined
                : `${field.label} must be at least ${field.minLength} characters.`;
        case FieldRule.MAX_LENGTH:
            return field.maxLength === undefined
                ? undefined
                : `${field.label} must be at most ${field.maxLength} characters.`;
        case FieldRule.EMAIL:
            return 'Please enter a valid email address.';
        case FieldRule.URL:
            return 'Please enter a valid URL.';
        case FieldRule.PHONE:
            return INVALID_PHONE_MESSAGE;
        case FieldRule.PATTERN:
            return `${field.label} is not in the expected format.`;
        case FieldRule.PHONE_COUNTRY:
            return phoneCountryMessage(field.phone?.allowedCountries);
        default:
            return undefined;
    }
}

const INVALID_PHONE_MESSAGE = 'Please enter a valid phone number.';

/** Bookings participant phones are judged by the same `checkPhone` as forms (DL #58). */
function summaryPhoneMessage(field: FormFieldSummaryView, trimmed: string): string {
    const phone = checkPhone(trimmed, field.phone);
    if (phone.rule === FieldRule.PHONE) return INVALID_PHONE_MESSAGE;
    if (phone.rule === FieldRule.PHONE_COUNTRY)
        return phoneCountryMessage(field.phone?.allowedCountries);
    return '';
}

function phoneCountryMessage(allowedCountries: string[] | undefined): string {
    if (!allowedCountries?.length) return 'Please include the country code, starting with +.';
    const codes = callingCodesOf(allowedCountries).join(', ');
    return `Please enter a number with one of these country codes: ${codes}.`;
}

/**
 * Browser format rules for Email and URL: each may reject only values Wix's server also rejects
 * (DL#55 P1, L1). Phones are judged by `checkPhone` against Wix's caller path (DL#55 P1c).
 */
const FORMAT_RULES = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    url: /^[a-z][a-z\d+.-]*:\/\/\S+$/i, // any scheme: looser than Wix by design (DL#55 Q4)
} as const;

function checkTextRules(field: FormFieldView, trimmed: string): FieldCheckResult {
    if (field.minLength !== undefined && trimmed.length < field.minLength) {
        return failure(FieldRule.MIN_LENGTH, field);
    }
    if (field.maxLength !== undefined && trimmed.length > field.maxLength) {
        return failure(FieldRule.MAX_LENGTH, field);
    }
    if (field.inputType === 'email' && !FORMAT_RULES.email.test(trimmed)) {
        return failure(FieldRule.EMAIL, field);
    }
    if (field.inputType === 'url' && !FORMAT_RULES.url.test(trimmed)) {
        return failure(FieldRule.URL, field);
    }
    if (field.inputType === 'tel') {
        const phone = checkPhone(trimmed, field.phone);
        if (phone.rule !== FieldRule.NONE) return failure(phone.rule, field);
    }
    return checkPattern(field, trimmed);
}

/** An invalid `pattern` regex passes, as before (the site owner's typo must not block submit). */
function checkPattern(field: FormFieldView, trimmed: string): FieldCheckResult {
    if (!field.pattern) return PASSED;
    try {
        return new RegExp(field.pattern).test(trimmed) ? PASSED : failure(FieldRule.PATTERN, field);
    } catch {
        return PASSED;
    }
}
