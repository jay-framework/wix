import type { FieldRule } from './components/field-rule.js';
import type { SubmitFailure } from './components/submit-outcome.js';
import type { AddressFieldSpec, AddressValue, LayoutPart } from './address/address-types.js';

export type FormFieldInputType =
    | 'text'
    | 'email'
    | 'tel'
    | 'url'
    | 'textarea'
    | 'select'
    | 'checkbox'
    | 'multiselect'
    | 'address';

/**
 * A submitted form value (DL#41 4c). A plain checkbox carries a boolean, a
 * multi-select carries a string array, an address its parts (DL #52), every other field a string. This is the
 * runtime TypeScript value type (NOT a contract `dataType`): it flows through the
 * store, `readFormValues`, the submit action, the service, and the create-submission
 * wrapper. The contract exposes these as supported primitives only (checkbox →
 * boolean `value` variant; multiselect → per-option `selected` variant).
 */
export type FieldValue = string | string[] | boolean | AddressValue;

export interface FormFieldOptionView {
    value: string;
    label: string;
}

/** Country rules for a tel field (DL#55 P1c). ISO 3166-1 alpha-2, upper case. */
export interface PhoneRules {
    /** The Phone field's defaultCountryCode (P1c-b), else config `defaultPhoneCountry`. */
    defaultCountry?: string;
    /** The Phone field's allowedCountryCodes (P1c-b); absent or empty = any country. */
    allowedCountries?: string[];
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
    /** Only on `tel` fields, only when a rule is known (DL#55 P1c). */
    phone?: PhoneRules;
    /** Present iff `inputType === 'address'` (DL #52): the one spec every consumer reads. */
    address?: AddressFieldSpec;
}

/** @deprecated Since DL #51: the Summary API has no `required`; see `getRawForm`. */
export interface FormFieldSummaryView {
    target: string;
    label: string;
    type: 'STRING' | 'EMAIL' | 'PHONE' | 'NUMBER' | 'URL';
    required: boolean;
    /** PHONE fields only (DL #58): config `defaultPhoneCountry`; the Form Summary API has no field country. */
    phone?: PhoneRules;
}

export interface FormFieldErrorView {
    target: string;
    errorMessage: string;
}

/** A form field this version cannot render or submit (DL #51 §1). */
export interface UnsupportedFieldView {
    target: string;
    label: string;
    /** `wixKindOf(key)`, or the Summary API's type. */
    wixKind: string;
    /** `'unknown'` only from the deprecated Summary path, which never blocks (DL #51 Q13). */
    required: boolean | 'unknown';
}

/** A projection that keeps every input field: rendered (`fields`) or listed (`unsupportedFields`). */
export interface ProjectedForm<F> {
    fields: F[];
    unsupportedFields: UnsupportedFieldView[];
}

/** A form enumerated at build time, with its projected visible fields (DL#40). */
export interface ListedFormView {
    id: string;
    name: string;
    fields: FormFieldView[];
    unsupportedFields: UnsupportedFieldView[];
    /**
     * The raw form has an `ADDRESS` input (DL #52 §5): submit projects such a form per call.
     * Absent counts as unknown, never as "no address".
     */
    hasAddress?: boolean;
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
          /** Server field errors the plugin classifies (DL#55); absent targets are `SERVER`. */
          fieldRules?: Record<string, FieldRule>;
          /** A hook's `ActionError` / `FieldRejection` code (DL#53 G3/G4); absent for plugin and Wix failures. */
          code?: string;
          /** True only when `fieldErrors` come from a submit hook's `FieldRejection` (DL #57 H). */
          fromHook?: boolean;
          /** `<target>/subdivision` → the codes Wix accepts, learned from this 400 (DL #52 Q6). */
          fieldOptions?: Record<string, FormFieldOptionView[]>;
          /** target → parts Wix required that the layout hid (DL #52 Q17). */
          revealedParts?: Record<string, LayoutPart[]>;
          /** target → the country the learned facts belong to (the submitted one, review m7). */
          factsCountry?: Record<string, string>;
      };
