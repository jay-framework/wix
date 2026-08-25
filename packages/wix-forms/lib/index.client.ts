/**
 * Client-safe entry point for @jay-framework/wix-forms.
 */
export { init } from './init.js';
export { contactForm } from './components/contact-form.js';
export { getFormSummary, submitForm } from './actions/forms-actions.js';
export {
    validateContactField,
    validateFormSummaryField,
} from './utils/project-form-fields.js';
export type { ContactFormFieldView, FormFieldSummaryView, FormFieldErrorView } from './types.js';
