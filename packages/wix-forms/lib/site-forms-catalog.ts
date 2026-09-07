import type { WixClient } from '@wix/sdk';
import { getFormSchema } from './wix-apis/get-form.js';
import { listSiteFormSchemas } from './wix-apis/list-forms.js';
import { contractNameToKebab, formContractName } from './utils/form-contract-name.js';
import { projectFormFields } from './utils/project-form-fields.js';

export interface SiteFormEntry {
    formId: string;
    title: string;
    contractName: string;
    contractSlug: string;
}

export interface WixFormsSiteCatalog {
    forms: SiteFormEntry[];
}

function materializedContractRelPath(contractSlug: string): string {
    return `agent-kit/materialized-contracts/wix-forms/form-${contractSlug}.jay-contract`;
}

export function materializedContractPathForEntry(entry: SiteFormEntry): string {
    return materializedContractRelPath(entry.contractSlug);
}

export function findSiteFormByContractSlug(
    catalog: WixFormsSiteCatalog,
    contractSlug: string,
): SiteFormEntry | undefined {
    return catalog.forms.find((entry) => entry.contractSlug === contractSlug);
}

export function findSiteFormByFormId(
    catalog: WixFormsSiteCatalog,
    formId: string,
): SiteFormEntry | undefined {
    return catalog.forms.find((entry) => entry.formId === formId);
}

/**
 * Discover all usable Wix Forms on the site via API (.wix.yaml credentials).
 * Skips forms with no renderable input fields.
 */
export async function buildSiteFormsCatalog(wixClient: WixClient): Promise<WixFormsSiteCatalog> {
    const listed = await listSiteFormSchemas(wixClient);
    const usedNames = new Set<string>();
    const forms: SiteFormEntry[] = [];

    for (const { formId, title } of listed) {
        try {
            const { form } = await getFormSchema(wixClient, formId);
            if (!form) {
                console.warn(`[wix-forms] Skipping form ${formId}: schema missing from Wix response`);
                continue;
            }
            const fields = projectFormFields(form);
            if (fields.length === 0) {
                console.warn(`[wix-forms] Skipping form "${title}" (${formId}): no usable input fields`);
                continue;
            }
            const contractName = formContractName(formId, title, usedNames);
            forms.push({
                formId,
                title,
                contractName,
                contractSlug: contractNameToKebab(contractName),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[wix-forms] Skipping form "${title}" (${formId}): ${message}`);
        }
    }

    return { forms };
}
