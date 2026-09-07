import type { WixClient } from '@wix/sdk';
import { registerService } from '@jay-framework/stack-server-runtime';
import type { WixFormsSiteCatalog } from '../site-forms-catalog.js';
import { createFormSubmission } from '../wix-apis/create-submission.js';
import { getFormSchema } from '../wix-apis/get-form.js';
import { getFormSummary } from '../wix-apis/get-form-summary.js';
import { findSiteFormByFormId } from '../site-forms-catalog.js';
import { projectFormFields, projectFormSummaryFields } from '../utils/project-form-fields.js';
import { WIX_FORMS_SERVICE, type WixFormsService } from './wix-forms-service-marker.js';

export function provideWixFormsService(
    wixClient: WixClient,
    catalog: WixFormsSiteCatalog,
): WixFormsService {
    const service: WixFormsService = {
        catalog,

        async getFormFields(formId) {
            if (!formId) {
                throw new Error(
                    'Form ID is missing. Bind contract="form/<name>" or pass formId prop — forms are resolved from the site catalog.',
                );
            }
            if (!findSiteFormByFormId(catalog, formId)) {
                throw new Error(`Form "${formId}" was not found in the site forms catalog. Re-run jay-stack agent-kit.`);
            }
            const { form } = await getFormSchema(wixClient, formId);
            if (!form) {
                throw new Error('Form schema missing from Wix response');
            }
            const fields = projectFormFields(form);
            if (!fields.length) {
                throw new Error('Form has no usable input fields');
            }
            return fields;
        },

        async getFormDisplayName(formId) {
            if (!formId) {
                return undefined;
            }
            const cached = findSiteFormByFormId(catalog, formId);
            if (cached) {
                return cached.title;
            }
            const { form } = await getFormSchema(wixClient, formId);
            return form?.properties?.name?.trim() || form?.name?.trim() || undefined;
        },

        async getFormSummaryFields(formId) {
            if (!formId) {
                throw new Error(
                    'Form ID is missing. This booking service has no participant form configured in Wix.',
                );
            }
            const { formSummary } = await getFormSummary(wixClient, formId);
            const fields = projectFormSummaryFields(formSummary?.fields);
            if (!fields.length) {
                throw new Error('Could not load participant form fields from Wix.');
            }
            return fields;
        },

        async createSubmission(formId, values) {
            if (!formId) {
                throw new Error('Form ID is missing. Bind a materialized form contract or pass formId prop.');
            }
            await createFormSubmission(wixClient, formId, values);
        },
    };

    registerService(WIX_FORMS_SERVICE, service);
    return service;
}

export { WIX_FORMS_SERVICE, type WixFormsService } from './wix-forms-service-marker.js';
