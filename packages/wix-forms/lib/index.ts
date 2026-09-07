/**
 * Server entry — setup, service registration, and re-exports for tooling.
 */
export { init } from './init.js';
export { setupWixForms, setup, generateWixFormsAgentKit } from './setup.js';
export { wixForm } from './components/wix-form.js';
export { generator as formContractGenerator } from './generators/form-contract-generator.js';
export { getFormSummary, submitForm } from './actions/forms-actions.js';
export { validateFormField, validateFormSummaryField } from './utils/project-form-fields.js';
export {
    provideWixFormsService,
    WIX_FORMS_SERVICE,
    type WixFormsService,
} from './services/wix-forms-service.js';
export type { FormFieldView, FormFieldSummaryView, FormFieldErrorView } from './types.js';
export type { SiteFormEntry, WixFormsSiteCatalog } from './site-forms-catalog.js';
export { buildSiteFormsCatalog } from './site-forms-catalog.js';
export { formContractName } from './utils/form-contract-name.js';
