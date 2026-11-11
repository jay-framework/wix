/**
 * Client-safe entry point for @jay-framework/wix-forms.
 */
export { init } from './init.js';
export { wixForm } from './components/wix-form.js';
export { getFormSummary, submitForm } from './actions/forms-actions.js';
export {
    checkFormField,
    validateFormField,
    validateFormSummaryField,
} from './utils/project-form-fields.js';
export { FieldRule, type FieldCheckResult } from './components/field-rule.js';
export {
    WIX_FORMS_CONTEXT,
    provideWixFormsContext,
    type FieldCheck,
    type FieldChecks,
    type SubmitOutcomeEvent,
    type SubmitOutcomeHandler,
    type WixFormsContext,
} from './contexts/wix-forms-context.js';
export type {
    FieldValue,
    FormFieldView,
    FormFieldSummaryView,
    FormFieldErrorView,
} from './types.js';
