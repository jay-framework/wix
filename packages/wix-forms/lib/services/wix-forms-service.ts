import type { WixClient } from '@wix/sdk';
import { WixApiError } from '@jay-framework/wix-server-client';
import { registerService } from '@jay-framework/stack-server-runtime';
import type { WixFormsConfig } from '../config-loader.js';
import { createFormSubmission } from '../wix-apis/create-submission.js';
import { getFormSchema } from '../wix-apis/get-form.js';
import { getFormSummary } from '../wix-apis/get-form-summary.js';
import {
    projectContactFormFields,
    projectFormSummaryFields,
} from '../utils/project-form-fields.js';
import {
    WIX_FORMS_SERVICE,
    type WixFormsService,
} from './wix-forms-service-marker.js';

export function provideWixFormsService(
    wixClient: WixClient,
    config: WixFormsConfig,
): WixFormsService {
    const service: WixFormsService = {
        async getContactFormFields(formId) {
            const resolvedFormId = formId || config.defaultContactFormId;
            if (!resolvedFormId) {
                throw new Error('Contact form ID is missing. Set defaultContactFormId in config/.wix-forms.yaml.');
            }
            const { form } = await getFormSchema(wixClient, resolvedFormId);
            if (!form) {
                throw new Error('Form schema missing from Wix response');
            }
            const fields = projectContactFormFields(form);
            if (!fields.length) {
                throw new Error('Form has no usable input fields');
            }
            return fields;
        },

        async getFormSummaryFields(formId) {
            if (!formId) {
                return projectFormSummaryFields(undefined);
            }
            try {
                const { formSummary } = await getFormSummary(wixClient, formId);
                return projectFormSummaryFields(formSummary?.fields);
            } catch {
                return projectFormSummaryFields(undefined);
            }
        },

        async createSubmission(formId, values) {
            const resolvedFormId = formId || config.defaultContactFormId;
            if (!resolvedFormId) {
                throw new Error('Contact form ID is missing. Set defaultContactFormId in config/.wix-forms.yaml.');
            }
            try {
                await createFormSubmission(wixClient, resolvedFormId, values);
            } catch (error) {
                if (error instanceof WixApiError) {
                    throw error;
                }
                throw error;
            }
        },
    };

    registerService(WIX_FORMS_SERVICE, service);
    return service;
}

export { WIX_FORMS_SERVICE, type WixFormsService } from './wix-forms-service-marker.js';
