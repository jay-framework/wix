import type { WixFormsService } from '../services/wix-forms-service-marker.js';
import { findSiteFormByContractSlug } from '../site-forms-catalog.js';

export async function resolveFormId(
    forms: WixFormsService,
    options: { formIdProp?: string; contractName?: string },
): Promise<string> {
    if (options.formIdProp) {
        return options.formIdProp;
    }

    if (options.contractName?.startsWith('form/')) {
        const contractSlug = options.contractName.slice('form/'.length);
        const entry = findSiteFormByContractSlug(forms.catalog, contractSlug);
        if (entry) {
            return entry.formId;
        }
        throw new Error(
            `No site form matches contract "form/${contractSlug}". Re-run jay-stack agent-kit after adding forms in Wix.`,
        );
    }

    throw new Error(
        'Form ID is missing. Use contract="form/<name>" from agent-kit/materialized-contracts/wix-forms/.',
    );
}

export function isFormOnSite(forms: WixFormsService, formId: string): boolean {
    if (!formId) {
        return false;
    }
    return forms.catalog.forms.some((entry) => entry.formId === formId);
}
