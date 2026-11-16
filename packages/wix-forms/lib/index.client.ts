/**
 * Client-safe entry point for @jay-framework/wix-forms.
 */
export { init } from './init.js';
export { wixForm } from './components/wix-form.js';
export { getFormSummary, submitForm } from './actions/forms-actions.js';
export {
    checkFormField,
    projectFormFields,
    unsupportedFieldOf,
    inLayoutOrder,
    validateFormField,
    validateFormSummaryField,
} from './utils/project-form-fields.js';
export { toPostedSummaryValues } from './components/submission-values.js';
export { FieldRule, type FieldCheckResult } from './components/field-rule.js';
export {
    WIX_FORMS_CONTEXT,
    provideWixFormsContext,
    type FieldCheck,
    type FieldChecks,
    type SubmitOutcomeEvent,
    type SubmitOutcomeHandler,
    type SubmitStartEvent,
    type SubmitStartHandler,
    type WixFormsContext,
} from './contexts/wix-forms-context.js';
// Pure classification (DL #51), shared with wix-bookings' client code.
export {
    readFieldKey,
    classifyFormField,
    ignoreReasonOf,
    wixKindOf,
    type FieldKey,
    type FieldIgnoreReason,
} from './utils/classify-form-field.js';
export { readFieldView, type FieldViewData } from './utils/read-field-view.js';
export { canonicalFormId } from './utils/form-id.js';
export type { RawForm, RawFormField } from './wix-apis/get-form.js';
export type {
    FieldValue,
    FormFieldView,
    FormFieldSummaryView,
    PhoneRules,
    FormFieldErrorView,
    FormFieldOptionView,
    ProjectedForm,
    UnsupportedFieldView,
} from './types.js';
