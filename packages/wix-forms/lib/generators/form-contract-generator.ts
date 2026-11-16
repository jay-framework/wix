/**
 * Per-form contract generator (DL#40).
 *
 * Runs in the jay agent-kit phase: enumerates every form in the configured
 * namespace via List Forms and emits one contract per form, with tags named
 * after that form's visible fields. Every contract → the shared `wixForm`
 * component, selected at runtime by `metadata.formId`. Mirrors wix-data's
 * `itemContractGenerator`.
 */

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_FORMS_SERVICE } from '../services/wix-forms-service-marker.js';
import type { ListedFormView } from '../types.js';
import { sourceEditingContractHeader } from '../source-editing.js';
import { fieldTag, hiddenFieldTag, reservedFormTags, toPascalCase } from './contract-utils.js';
import { computeFormSlugs } from './form-slug.js';

/**
 * Build one per-form contract YAML.
 *
 * `slug` is the registered contract slug (`form/<slug>`); the YAML's own
 * `name:` is PascalCase(slug) + "Form" (DL#40 §3).
 */
function buildContract(form: ListedFormView, slug: string): string {
    const fieldTags = form.fields.map((field) =>
        field.hidden ? hiddenFieldTag(field) : fieldTag(field),
    );
    const tags = [...fieldTags, reservedFormTags()].join('\n');
    return `name: ${toPascalCase(slug)}Form
description: ${yamlScalar(describe(form))}
${sourceEditingContractHeader(form.id)}
tags:
${tags}`;
}

/** Plain when YAML reads it back unchanged; JSON-quoted (valid YAML) otherwise, e.g. for `: `. */
function yamlScalar(text: string): string {
    const plain = /^[^\s'"&*!|>%@`{}\[\],#?:-][^]*$/.test(text) && !/: | #|\n|\s$/.test(text);
    return plain ? text : JSON.stringify(text);
}

function describe(form: ListedFormView): string {
    const identity = `Wix form "${form.name}" (${form.id})`;
    if (!form.unsupportedFields.length) return identity;
    const labels = form.unsupportedFields.map((field) => field.label).join(', ');
    return `${identity}. Unsupported fields left out: ${labels}.`;
}

/** DL #51 §2: a warning, not an error, so one form cannot stop agent-kit for the whole site. */
function warnUnsupportedFields(form: ListedFormView, slug: string): void {
    for (const field of form.unsupportedFields) {
        console.warn(
            `[wix-forms] Form "${form.name}": field "${field.target}" (${field.label}, ${field.wixKind}) is not supported and was left out of form/${slug}.`,
        );
    }
}

export const generator = makeContractGenerator()
    .withServices(WIX_FORMS_SERVICE)
    .generateWith(async (forms) => {
        const listed = await forms.listForms();
        const slugById = computeFormSlugs(listed);

        return listed.map((form) => {
            const slug = slugById.get(form.id)!;
            warnUnsupportedFields(form, slug);
            console.log(`[wix-forms] Generated form contract: form/${slug}`);
            return {
                // The materializer kebab-cases this into `form/<name>`; the slug is
                // already kebab, so it registers as `form/<slug>` exactly (DL#40).
                name: slug,
                yaml: buildContract(form, slug),
                description: describe(form),
                metadata: { formId: form.id },
            };
        });
    });
