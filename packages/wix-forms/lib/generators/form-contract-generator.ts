/**
 * Form Contract Generator
 *
 * Materializes per-form contracts by extending the base static contract
 * with site-specific fieldCatalog rows from Wix Forms API.
 *
 * Design Log #31 — auto-fetch revision: all site forms from Wix API.
 */

import fs from 'node:fs';
import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_FORMS_SERVICE } from '../services/wix-forms-service-marker.js';
import { buildFieldCatalogBlock, toFieldCatalogRows } from '../utils/field-catalog.js';
import { resolveFormBaseContractPath } from '../utils/resolve-form-base-contract-path.js';

function loadBaseContractYaml(): string {
    const baseContractPath = resolveFormBaseContractPath(import.meta.url);
    return fs.readFileSync(baseContractPath, 'utf-8');
}

function buildMaterializedContractYaml(
    contractName: string,
    description: string,
    rows: ReturnType<typeof toFieldCatalogRows>,
): string {
    const baseYaml = loadBaseContractYaml()
        .replace(/^name:.*$/m, `name: ${contractName}`)
        .replace(/^description:.*$/m, `description: ${description}`)
        .replace(/\n  - tag: fieldCatalog[\s\S]*$/, '');

    const withoutTrailingNewline = baseYaml.replace(/\s*$/, '');
    return `${withoutTrailingNewline}\n\n${buildFieldCatalogBlock(rows)}\n`;
}

export const generator = makeContractGenerator()
    .withServices(WIX_FORMS_SERVICE)
    .generateWith(async (formsService) => {
        const results = [];

        for (const entry of formsService.catalog.forms) {
            const fields = await formsService.getFormFields(entry.formId);
            const rows = toFieldCatalogRows(fields);
            const description = `Wix form ${entry.title} (formId ${entry.formId})`;

            console.log(`[wix-forms] Generated form contract: ${entry.contractName}`);

            results.push({
                name: entry.contractName,
                yaml: buildMaterializedContractYaml(entry.contractName, description, rows),
                description,
                metadata: {
                    formId: entry.formId,
                    title: entry.title,
                    fieldCount: rows.length,
                },
            });
        }

        return results;
    });
