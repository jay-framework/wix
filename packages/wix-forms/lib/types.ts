import type { SubmitFailure } from './components/submit-outcome.js';

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
 * A submitted form value (DL#41 4c). A plain checkbox carries a boolean, a
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
    /** A Wix hidden field (DL#41 4a) — no visible input; a page populates it via `control`. */
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

/** A form enumerated at build time, with its projected visible fields (DL#40). */
export interface ListedFormView {
    id: string;
    name: string;
    fields: FormFieldView[];
}

/** The `submitForm` action input (DL#41). */
export interface SubmitRequestInput {
    formId?: string;
    values: Record<string, FieldValue>;
    /** The page's honeypot, for direct / scripted posts (DL#53 H). The plugin component never sends it. */
    honeypot?: string;
}

/**
 * The `submitForm` action result (DL#41 planned fix, extended by DL#42). Every outcome is
 * RETURNED, because the action transport keeps only `{ code, message }` of a thrown error.
 */
export type SubmitFormResult =
    | { success: true; redirectTo?: string }
    | {
          success: false;
          reason: SubmitFailure;
          message?: string;
          fieldErrors?: Record<string, string>;
          /** A hook's `ActionError` / `FieldRejection` code (DL#53 G3/G4); absent for plugin and Wix failures. */
          code?: string;
      };
