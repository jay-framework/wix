/**
 * Server entry — setup, service registration, and re-exports for tooling.
 */
export { init } from './init.js';
// setup handler (setupWixForms/setup) is tools-time — moved to ./tools (DL#179).
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
export {
    provideWixFormsService,
    WIX_FORMS_SERVICE,
    type WixFormsService,
} from './services/wix-forms-service.js';
export {
    WIX_FORMS_SUBMIT_HOOKS,
    FieldRejection,
    SubmitIgnoredError,
    SessionExpiredError,
    NoCallerSessionError,
    type SubmitOptions,
    type SubmitHook,
    type SubmitHooks,
    type SubmitHookInput,
    type SubmitHookOutcome,
} from './services/wix-forms-submit-hooks.js';
export type {
    SubmitFormResult,
    FieldValue,
    FormFieldView,
    FormFieldSummaryView,
    PhoneRules,
    FormFieldErrorView,
    FormFieldOptionView,
    ListedFormView,
    ProjectedForm,
    UnsupportedFieldView,
} from './types.js';
export type { WixFormsConfig } from './config-loader.js';

// Dynamic contract generator (for per-form contract materialization, DL#40)
export { generator as formContractGenerator } from './generators/form-contract-generator.js';
