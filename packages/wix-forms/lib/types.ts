export type FormFieldInputType =
    | 'text'
    | 'email'
    | 'tel'
    | 'url'
    | 'textarea'
    | 'select'
    | 'checkbox'
    | 'multiselect';

/**
 * A submitted form value (DL#39 4c). A plain checkbox carries a boolean, a
 * multi-select carries a string array, every other field a string. This is the
 * runtime TypeScript value type (NOT a contract `dataType`): it flows through the
 * store, `readFormValues`, the submit action, the service, and the create-submission
 * wrapper. The contract exposes these as supported primitives only (checkbox →
 * boolean `value` variant; multiselect → per-option `selected` variant).
 */
export type FieldValue = string | string[] | boolean;

export interface FormFieldOptionView {
    value: string;
    label: string;
}

export interface FormFieldView {
    target: string;
    label: string;
    inputType: FormFieldInputType;
    required: boolean;
    placeholder: string;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    options: FormFieldOptionView[];
    /** A Wix hidden field (DL#39 4a) — no visible input; a page populates it via `control`. */
    hidden?: boolean;
}

export interface FormFieldSummaryView {
    target: string;
    label: string;
    type: 'STRING' | 'EMAIL' | 'PHONE' | 'NUMBER' | 'URL';
    required: boolean;
}

export interface FormFieldErrorView {
    target: string;
    errorMessage: string;
}

/** A form enumerated at build time, with its projected visible fields (DL#38). */
export interface ListedFormView {
    id: string;
    name: string;
    fields: FormFieldView[];
}
