/**
 * Server entry — setup, service registration, and re-exports for tooling.
 */
export { init } from './init.js';
// setup handler (setupWixForms/setup) is tools-time — moved to ./tools (DL#179).
export { wixForm } from './components/wix-form.js';
export { getFormSummary, submitForm } from './actions/forms-actions.js';
export { validateFormField, validateFormSummaryField } from './utils/project-form-fields.js';
export {
    provideWixFormsService,
    WIX_FORMS_SERVICE,
    type WixFormsService,
} from './services/wix-forms-service.js';
export {
    WIX_FORMS_SUBMISSION_AUGMENTER,
    type SubmissionAugmenter,
    type SubmissionAugmentInput,
} from './services/wix-forms-submission-augmenter.js';
export type {
    FieldValue,
    FormFieldView,
    FormFieldSummaryView,
    FormFieldErrorView,
    ListedFormView,
} from './types.js';
export type { WixFormsConfig } from './config-loader.js';

// Dynamic contract generator (for per-form contract materialization, DL#38)
export { generator as formContractGenerator } from './generators/form-contract-generator.js';
