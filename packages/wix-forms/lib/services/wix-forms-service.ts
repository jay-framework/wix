import type { WixClient } from '@wix/sdk';
import { registerService } from '@jay-framework/stack-server-runtime';
import { DEFAULT_FORMS_NAMESPACE, type WixFormsConfig } from '../config-loader.js';
import { createFormSubmission } from '../wix-apis/create-submission.js';
import { getFormSchema } from '../wix-apis/get-form.js';
import { getFormSummary } from '../wix-apis/get-form-summary.js';
import { listForms } from '../wix-apis/list-forms.js';
import { projectFormFields, projectFormSummaryFields } from '../utils/project-form-fields.js';
import type { ListedFormView } from '../types.js';
import { WIX_FORMS_SERVICE, type WixFormsService } from './wix-forms-service-marker.js';

export function provideWixFormsService(
    wixClient: WixClient,
    config: WixFormsConfig,
): WixFormsService {
    let listCache: ListedFormView[] | undefined;

    const service: WixFormsService = {
        config,

        async listForms() {
            if (listCache) {
                return listCache;
            }
            const forms = await listForms(wixClient, {
                namespace: config.namespace,
                formIds: config.formIds,
                include: config.include,
            });
            if (!forms.length) {
                warnNoFormsListed(config);
            }
            listCache = forms.map((form) => ({
                id: form.id,
                name: form.name ?? form.id,
                fields: projectFormFields(form),
            }));
            return listCache;
        },

        async getFormFields(formId) {
            if (!formId) {
                throw new Error('Form ID is missing.');
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

        async createSubmission(formId, values, authorization) {
            if (!formId) {
                throw new Error('Form ID is missing.');
            }
            await createFormSubmission(wixClient, formId, values, authorization);
        },
    };

    registerService(WIX_FORMS_SERVICE, service);
    return service;
}

/** Empty List Forms is valid (no forms yet); warn when filters may be wrong. */
function warnNoFormsListed(config: WixFormsConfig): void {
    const scope =
        `[wix-forms] No forms listed for namespace "${config.namespace}" ` +
        `(include: ${config.include}). No per-form contracts were generated.`;

    if (config.formIds.length > 0) {
        console.warn(
            `${scope} None of the formIds in config/.wix-forms.yaml matched: ` +
                `${config.formIds.join(', ')}. Check ids, namespace, and include.`,
        );
        return;
    }

    console.warn(
        `${scope} If you expected forms, confirm namespace in config/.wix-forms.yaml ` +
            `(standalone Wix Forms use "${DEFAULT_FORMS_NAMESPACE}"). ` +
            `If the site has no forms yet, this is normal — create forms in Wix and re-run agent-kit.`,
    );
}

export { WIX_FORMS_SERVICE, type WixFormsService } from './wix-forms-service-marker.js';
