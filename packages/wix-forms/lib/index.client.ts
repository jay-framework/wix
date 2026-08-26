/**
 * Client-safe entry point for @jay-framework/wix-forms.
 */
export { init } from './init.js';
export { wixForm } from './components/wix-form.js';
export { getFormSummary, submitForm } from './actions/forms-actions.js';
export { validateFormField, validateFormSummaryField } from './utils/project-form-fields.js';
export type { FormFieldView, FormFieldSummaryView, FormFieldErrorView } from './types.js';
