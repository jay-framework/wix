import type { RawFormField } from '../wix-apis/get-form.js';
import type { FormSummaryField } from '../wix-apis/get-form-summary.js';
import type {
    FieldValue,
    FormFieldInputType,
    FormFieldOptionView,
    FormFieldSummaryView,
    FormFieldView,
} from '../types.js';

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

function componentTypeOf(field: RawFormField): string | undefined {
    return (
        field.view?.fieldType ??
        field.inputOptions?.stringOptions?.componentType ??
        field.inputOptions?.arrayOptions?.componentType
    );
}

/** A choice field that permits selecting more than one option (DL#39 4c). */
function isMultiSelect(field: RawFormField): boolean {
    if (field.inputOptions?.arrayOptions) return true;
    return MULTI_SELECT_TYPES.has(componentTypeOf(field) ?? '');
}

/** A single boolean checkbox (consent-style) — no options, boolean-valued (DL#39 4c). */
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

export function projectFormFields(rawForm: {
    fields?: RawFormField[];
    formFields?: RawFormField[];
}): FormFieldView[] {
    const rawFields = rawForm.fields ?? rawForm.formFields ?? [];
    // DL#39 4a narrows DL#38 OQ-4: hidden fields are MARKED (hidden: true), not dropped,
    // so a page can populate them via the `control` channel and they reach the submission.
    return rawFields
        .filter((field) => field.target)
        .map((field) => {
            const target = field.target!;
            const label =
                field.view?.label ??
                field.inputOptions?.stringOptions?.textInputOptions?.label ??
                target;
            const placeholder =
                field.view?.placeholder ??
                field.inputOptions?.stringOptions?.textInputOptions?.placeholder ??
                '';

            return {
                target,
                label,
                inputType: readInputType(field, target),
                required: Boolean(field.validation?.required),
                placeholder,
                minLength: field.validation?.string?.minLength,
                maxLength: field.validation?.string?.maxLength,
                pattern: field.validation?.string?.pattern,
                options: readFieldOptions(field),
                hidden: Boolean(field.hidden),
            };
        });
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

export function validateFormField(field: FormFieldView, value: FieldValue): string {
    // Non-string kinds (DL#39 4c): required means checked (boolean) / non-empty (array);
    // the string format/length/regex rules below apply only to string values.
    if (field.inputType === 'checkbox') {
        return field.required && value !== true ? `${field.label} is required.` : '';
    }
    if (field.inputType === 'multiselect') {
        const empty = !Array.isArray(value) || value.length === 0;
        return field.required && empty ? `${field.label} is required.` : '';
    }

    const trimmed = (typeof value === 'string' ? value : '').trim();
    if (field.required && !trimmed) {
        return `${field.label} is required.`;
    }
    if (!trimmed) {
        return '';
    }
    if (field.minLength !== undefined && trimmed.length < field.minLength) {
        return `${field.label} must be at least ${field.minLength} characters.`;
    }
    if (field.maxLength !== undefined && trimmed.length > field.maxLength) {
        return `${field.label} must be at most ${field.maxLength} characters.`;
    }
    if (field.inputType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return 'Please enter a valid email address.';
    }
    if (field.inputType === 'url' && !/^https?:\/\/.+/.test(trimmed)) {
        return 'Please enter a valid URL.';
    }
    if (field.inputType === 'tel' && !/^[+()\-\s\d]{7,}$/.test(trimmed)) {
        return 'Please enter a valid phone number.';
    }
    if (field.pattern) {
        try {
            if (!new RegExp(field.pattern).test(trimmed)) {
                return `${field.label} is not in the expected format.`;
            }
        } catch {
            return '';
        }
    }
    return '';
}

export function parseSubmissionFieldErrors(responseBody: string): Record<string, string> {
    try {
        const parsed = JSON.parse(responseBody) as {
            details?: {
                validationError?: {
                    fieldViolations?: Array<{
                        data?: { errors?: Array<{ errorPath?: string; errorMessage?: string }> };
                    }>;
                };
            };
        };
        const fieldErrors: Record<string, string> = {};
        const violations = parsed.details?.validationError?.fieldViolations ?? [];
        for (const violation of violations) {
            for (const fieldError of violation.data?.errors ?? []) {
                if (fieldError.errorPath && !fieldErrors[fieldError.errorPath]) {
                    fieldErrors[fieldError.errorPath] = fieldError.errorMessage ?? 'Invalid value';
                }
            }
        }
        return fieldErrors;
    } catch {
        return {};
    }
}
