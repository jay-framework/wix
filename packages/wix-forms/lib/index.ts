/**
 * Server entry — setup, service registration, and re-exports for tooling.
 */
export { init } from './init.js';
export { setupWixForms, setup } from './setup.js';
export { contactForm } from './components/contact-form.js';
export { getFormSummary, submitForm } from './actions/forms-actions.js';
export {
    validateContactField,
    validateFormSummaryField,
} from './utils/project-form-fields.js';
export {
    provideWixFormsService,
    WIX_FORMS_SERVICE,
    type WixFormsService,
} from './services/wix-forms-service.js';
export type { ContactFormFieldView, FormFieldSummaryView, FormFieldErrorView } from './types.js';
