/**
 * Per-form contract generator (DL#36).
 *
 * Runs in the jay agent-kit phase: enumerates every form in the configured
 * namespace via List Forms and emits one contract per form, with tags named
 * after that form's visible fields. One contract → the shared `wixForm`
 * component, selected at runtime by `metadata.formId`. Mirrors wix-data's
 * `itemContractGenerator`.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_FORMS_SERVICE } from '../services/wix-forms-service-marker.js';
import type { ListedFormView } from '../types.js';
import { fieldTag, reservedFormTags, toPascalCase } from './contract-utils.js';
import { computeFormSlugs } from './form-slug.js';

/**
 * Build one per-form contract YAML.
 *
 * `slug` is the registered contract slug (`form/<slug>`); the YAML's own
 * `name:` is PascalCase(slug) + "Form" (DL#36 §3).
 */
function buildContract(form: ListedFormView, slug: string): string {
    const fieldTags = form.fields.map((field) => fieldTag(field));
    const tags = [...fieldTags, reservedFormTags()].join('\n');
    return `name: ${toPascalCase(slug)}Form
description: ${describe(form)}
tags:
${tags}`;
}

function describe(form: ListedFormView): string {
    return `Wix form "${form.name}" (${form.id})`;
}

export const generator = makeContractGenerator()
    .withServices(WIX_FORMS_SERVICE)
    .generateWith(async (forms) => {
        const listed = await forms.listForms();
        const slugById = computeFormSlugs(listed);

        return listed.map((form) => {
            const slug = slugById.get(form.id)!;
            console.log(`[wix-forms] Generated form contract: form/${slug}`);
            return {
                // The materializer kebab-cases this into `form/<name>`; the slug is
                // already kebab, so it registers as `form/<slug>` exactly (DL#36).
                name: slug,
                yaml: buildContract(form, slug),
                description: describe(form),
                metadata: { formId: form.id },
            };
        });
    });
