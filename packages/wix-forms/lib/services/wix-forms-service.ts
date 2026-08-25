import type { WixClient } from '@wix/sdk';
import { registerService } from '@jay-framework/stack-server-runtime';
import type { WixFormsConfig } from '../config-loader.js';
import { createFormSubmission } from '../wix-apis/create-submission.js';
import { getFormSchema } from '../wix-apis/get-form.js';
import { getFormSummary } from '../wix-apis/get-form-summary.js';
import { projectFormFields, projectFormSummaryFields } from '../utils/project-form-fields.js';
import { WIX_FORMS_SERVICE, type WixFormsService } from './wix-forms-service-marker.js';

export function provideWixFormsService(
    wixClient: WixClient,
    config: WixFormsConfig,
): WixFormsService {
    const service: WixFormsService = {
        async getFormFields(formId) {
            const resolvedFormId = formId || config.defaultFormId;
            if (!resolvedFormId) {
                throw new Error(
                    'Form ID is missing. Set defaultFormId in config/.wix-forms.yaml.',
                );
            }
            const { form } = await getFormSchema(wixClient, resolvedFormId);
            if (!form) {
                throw new Error('Form schema missing from Wix response');
            }
            const fields = projectFormFields(form);
            if (!fields.length) {
                throw new Error('Form has no usable input fields');
            }
            return fields;
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
            const resolvedFormId = formId || config.defaultFormId;
            if (!resolvedFormId) {
                throw new Error(
                    'Form ID is missing. Set defaultFormId in config/.wix-forms.yaml.',
                );
            }
            await createFormSubmission(wixClient, resolvedFormId, values);
        },
    };

    registerService(WIX_FORMS_SERVICE, service);
    return service;
}

export { WIX_FORMS_SERVICE, type WixFormsService } from './wix-forms-service-marker.js';
