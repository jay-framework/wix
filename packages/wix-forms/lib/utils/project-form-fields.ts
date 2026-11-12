import type { RawFieldLabel, RawFormField, RichContentNode } from '../wix-apis/get-form.js';
import type { FormSummaryField } from '../wix-apis/get-form-summary.js';
import type {
    FieldValue,
    FormFieldInputType,
    FormFieldOptionView,
    FormFieldSummaryView,
    FormFieldView,
} from '../types.js';
import { FieldRule, type FieldCheckResult } from '../components/field-rule.js';
import { callingCodesOf, checkPhone } from './phone-normalization.js';

const MULTI_SELECT_TYPES = new Set(['CHECKBOX_GROUP', 'MULTI_SELECT', 'TAGS']);

function readFieldOptions(field: RawFormField): FormFieldOptionView[] {
    const rawOptions =
        field.view?.options ??
        field.inputOptions?.stringOptions?.options ??
        field.inputOptions?.arrayOptions?.options ??
        [];
    return rawOptions
        .map((option) => ({
            value: option.value ?? option.label ?? '',
            label: option.label ?? option.value ?? '',
        }))
        .filter((option) => option.value);
}

function readLabelText(label: RawFieldLabel | undefined): string {
    if (label === undefined) return '';
    if (typeof label === 'string') return label;
    return collectRichText(label).trim();
}

function collectRichText(node: RichContentNode): string {
    const ownText = node.textData?.text ?? '';
    return ownText + (node.nodes ?? []).map(collectRichText).join('');
}

function componentTypeOf(field: RawFormField): string | undefined {
    return (
        field.view?.fieldType ??
        field.inputOptions?.stringOptions?.componentType ??
        field.inputOptions?.arrayOptions?.componentType
    );
}

/** A choice field that permits selecting more than one option (DL#41 4c). */
function isMultiSelect(field: RawFormField): boolean {
    if (field.inputOptions?.arrayOptions) return true;
    return MULTI_SELECT_TYPES.has(componentTypeOf(field) ?? '');
}

/** A single boolean checkbox (consent-style) — no options, boolean-valued (DL#41 4c). */
function isBooleanField(field: RawFormField): boolean {
    if (field.inputOptions?.booleanOptions || field.validation?.boolean) return true;
    return componentTypeOf(field) === 'CHECKBOX';
}

function readInputType(field: RawFormField, target: string): FormFieldInputType {
    const options = readFieldOptions(field);
    if (options.length > 0) {
        return isMultiSelect(field) ? 'multiselect' : 'select';
    }
    if (isBooleanField(field)) {
        return 'checkbox';
    }

    const viewFieldType = field.view?.fieldType ?? field.inputOptions?.stringOptions?.componentType;
    if (viewFieldType === 'TEXT_AREA' || target === 'message') {
        return 'textarea';
    }

    const format = field.validation?.string?.format;
    if (format === 'EMAIL') return 'email';
    if (format === 'PHONE') return 'tel';
    if (format === 'URL') return 'url';
    return 'text';
}

/** Site-level options for projecting a form for submission (DL#55 P1c). */
export interface ProjectionOptions {
    /** Config `defaultPhoneCountry`: the country of phones typed without a country code. */
    defaultPhoneCountry?: string;
}

export function projectFormFields(
    rawForm: {
        fields?: RawFormField[];
        formFields?: RawFormField[];
    },
    options: ProjectionOptions = {},
): FormFieldView[] {
    const rawFields = rawForm.fields ?? rawForm.formFields ?? [];
    // DL#41 4a narrows DL#40 OQ-4: hidden fields are MARKED (hidden: true), not dropped,
    // so a page can populate them via the `control` channel and they reach the submission.
    return rawFields
        .filter((field) => field.target)
        .map((field) => {
            const target = field.target!;
            const label =
                readLabelText(field.view?.label) ||
                readLabelText(field.inputOptions?.stringOptions?.textInputOptions?.label) ||
                target;
            const placeholder =
                field.view?.placeholder ??
                field.inputOptions?.stringOptions?.textInputOptions?.placeholder ??
                '';

            const inputType = readInputType(field, target);
            return {
                target,
                label,
                inputType,
                required: Boolean(field.validation?.required),
                placeholder,
                minLength: field.validation?.string?.minLength,
                maxLength: field.validation?.string?.maxLength,
                pattern: field.validation?.string?.pattern,
                options: readFieldOptions(field),
                hidden: Boolean(field.hidden),
                ...phoneRulesOf(field, inputType, options),
            };
        });
}

/**
 * `phone` only on tel fields, and only when a rule is known (DL#55 P1c). A Wix Phone field's own
 * default country wins over config `defaultPhoneCountry`.
 */
function phoneRulesOf(
    field: RawFormField,
    inputType: FormFieldInputType,
    { defaultPhoneCountry }: ProjectionOptions,
): Pick<FormFieldView, 'phone'> {
    if (inputType !== 'tel') return {};
    const defaultCountry = field.view?.defaultCountry || defaultPhoneCountry;
    const allowedCountries = field.validation?.string?.phoneOptions?.allowedCountryCodes ?? [];
    const phone = {
        ...(defaultCountry ? { defaultCountry } : {}),
        ...(allowedCountries.length ? { allowedCountries } : {}),
    };
    return Object.keys(phone).length ? { phone } : {};
}

export function projectFormSummaryFields(
    fields: FormSummaryField[] | undefined,
): FormFieldSummaryView[] {
    const projected = (fields ?? [])
        .filter((field) => !field.deleted)
        .filter(
            (field) =>
                field.type && ['STRING', 'EMAIL', 'PHONE', 'NUMBER', 'URL'].includes(field.type),
        )
        .map((field) => ({
            target: field.target ?? field.id ?? '',
            label: field.label ?? field.target ?? 'Field',
            type: (field.type ?? 'STRING') as FormFieldSummaryView['type'],
            required: Boolean(field.required),
        }))
        .filter((field) => field.target);

    return projected;
}

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
    if (field.type === 'PHONE' && !/^[+()\-\s\d]{7,}$/.test(trimmed)) {
        return 'Please enter a valid phone number.';
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
            return 'Please enter a valid phone number.';
        case FieldRule.PATTERN:
            return `${field.label} is not in the expected format.`;
        case FieldRule.PHONE_COUNTRY:
            return phoneCountryMessage(field.phone?.allowedCountries);
        default:
            return undefined;
    }
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
