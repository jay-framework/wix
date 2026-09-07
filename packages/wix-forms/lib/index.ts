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
export type { FormFieldView, FormFieldSummaryView, FormFieldErrorView } from './types.js';
