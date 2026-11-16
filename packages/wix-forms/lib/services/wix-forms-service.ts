import type { WixClient } from '@wix/sdk';
import { registerService } from '@jay-framework/stack-server-runtime';
import { DEFAULT_FORMS_NAMESPACE, type WixFormsConfig } from '../config-loader.js';
import { createFormSubmission } from '../wix-apis/create-submission.js';
import { getFormSchema } from '../wix-apis/get-form.js';
import { getFormSummary } from '../wix-apis/get-form-summary.js';
import { listForms } from '../wix-apis/list-forms.js';
import { createSubmittableFormCheck } from './submittable-forms.js';
import {
    projectFormFields,
    projectFormSummaryFields,
    requiredUntargetedLabels,
} from '../utils/project-form-fields.js';
import { canonicalFormId } from '../utils/form-id.js';
import type { ListedFormView, UnsupportedFieldView } from '../types.js';
import { WIX_FORMS_SERVICE, type WixFormsService } from './wix-forms-service-marker.js';
import {
    createAddressTemplateSource,
    TEMPLATES_ORIGIN_ENV,
    type AddressTemplateSource,
} from '../address/address-templates.js';
import {
    createLearnedAddressFacts,
    type LearnedAddressFacts,
} from '../address/learned-address-facts.js';
import { hasAddressField, type ProjectionOptions } from '../utils/project-form-fields.js';
import type { RawForm } from '../wix-apis/get-form.js';

/** Test seams; production builds both from the client and the environment. */
export interface WixFormsServiceDependencies {
    addressTemplateSource?: AddressTemplateSource;
    learnedAddressFacts?: LearnedAddressFacts;
}

export function provideWixFormsService(
    wixClient: WixClient,
    config: WixFormsConfig,
    dependencies: WixFormsServiceDependencies = {},
): WixFormsService {
    let listCache: ListedFormView[] | undefined;
    const addressTemplateSource =
        dependencies.addressTemplateSource ?? defaultAddressTemplateSource(wixClient);
    const learnedAddressFacts =
        dependencies.learnedAddressFacts ??
        createLearnedAddressFacts({ labels: config.address?.labels });

    /** Templates only for a form with an address; a failure throws (never an unsupported field, Q3). */
    async function projectionOptionsFor(
        rawForms: RawForm[],
        extra: Pick<ProjectionOptions, 'learnedFacts'> = {},
    ): Promise<ProjectionOptions> {
        const options: ProjectionOptions = {
            defaultPhoneCountry: config.defaultPhoneCountry,
            addressConfig: config.address,
            ...extra,
        };
        if (rawForms.some(hasAddressField)) {
            options.addressTemplates = await addressTemplateSource.load();
        }
        return options;
    }
    const summaryWarnedFormIds = new Set<string>();
    // Always `enabled`, whatever `config.include` says: that flag is for generation (DL #50 §1).
    const isSubmittableForm = createSubmittableFormCheck({
        namespace: config.namespace,
        configuredFormIds: config.formIds,
        listEnabledFormIds: async () =>
            (await listForms(wixClient, { namespace: config.namespace, include: 'enabled' })).map(
                (form) => form.id,
            ),
    });

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
            const options = await projectionOptionsFor(forms);
            listCache = forms.map((form) => {
                const name = form.name ?? form.id;
                warnRequiredUntargeted(name, requiredUntargetedLabels(form));
                return {
                    id: form.id,
                    name,
                    hasAddress: hasAddressField(form),
                    ...projectFormFields(form, options),
                };
            });
            return listCache;
        },

        async getRawForm(formId) {
            if (!canonicalFormId(formId)) {
                throw new Error('Form ID is not a valid Wix form id.');
            }
            const { form } = await getFormSchema(wixClient, formId);
            if (!form) {
                throw new Error('Form schema missing from Wix response');
            }
            return form;
        },

        async getFormFields(formId, fieldsOptions = {}) {
            if (!formId) {
                throw new Error('Form ID is missing.');
            }
            const rawForm = await service.getRawForm(formId);
            const projected = projectFormFields(
                rawForm,
                await projectionOptionsFor([rawForm], fieldsOptions),
            );
            if (!projected.fields.length && !projected.unsupportedFields.length) {
                throw new Error('Form has no usable input fields');
            }
            return projected;
        },

        async getFormSummaryFields(formId) {
            if (!formId) {
                throw new Error(
                    'Form ID is missing. This booking service has no participant form configured in Wix.',
                );
            }
            const { formSummary } = await getFormSummary(wixClient, formId);
            const projected = projectFormSummaryFields(formSummary?.fields, {
                defaultPhoneCountry: config.defaultPhoneCountry,
            });
            if (!projected.fields.length && !projected.unsupportedFields.length) {
                throw new Error('Could not load participant form fields from Wix.');
            }
            if (projected.unsupportedFields.length && !summaryWarnedFormIds.has(formId)) {
                summaryWarnedFormIds.add(formId);
                warnSummaryFieldsNotReturned(formId, projected.unsupportedFields);
            }
            return projected;
        },

        addressTemplates: () => addressTemplateSource.load(),

        learnedAddressFacts: () => learnedAddressFacts,

        async addressFieldsOf(formId) {
            const listed = (await service.listForms()).find(
                (form) => canonicalFormId(form.id) === canonicalFormId(formId),
            );
            if (listed?.hasAddress === false) return [];
            const { fields } = await service.getFormFields(formId, {
                learnedFacts: learnedAddressFacts.snapshot(),
            });
            return fields.filter((field) => field.inputType === 'address');
        },

        isSubmittableForm,

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

/**
 * List Form Templates through the site client's auth. The origin is overridable only by the
 * QA-only `WIX_FORMS_ADDRESS_TEMPLATES_ORIGIN` (DL #52 Q18); an invalid value throws at init.
 */
function defaultAddressTemplateSource(wixClient: WixClient): AddressTemplateSource {
    return createAddressTemplateSource({
        origin: process.env[TEMPLATES_ORIGIN_ENV],
        fetch: async (url) => {
            const { headers } = await (wixClient.auth as any).getAuthHeaders();
            const response = await fetch(url, { headers });
            if (!response.ok)
                throw new Error(`List Form Templates failed with HTTP ${response.status}`);
            return response.json();
        },
    });
}

/** DL #51 row 2: Wix requires the field, but with no target nothing can submit it. */
function warnRequiredUntargeted(formName: string, labels: string[]): void {
    for (const label of labels) {
        console.warn(
            `[wix-forms] Form "${formName}": required field "${label}" has no target in Wix and cannot be submitted.`,
        );
    }
}

function warnSummaryFieldsNotReturned(formId: string, fields: UnsupportedFieldView[]): void {
    const described = fields.map((field) => `${field.label} (${field.wixKind})`).join(', ');
    console.warn(
        `[wix-forms] Form ${formId}: fields not supported and not returned: ${described}.`,
    );
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
