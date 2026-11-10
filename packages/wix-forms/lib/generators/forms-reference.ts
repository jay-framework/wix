import type { FormFieldView, ListedFormView } from '../types.js';
import { computeFormSlugs } from './form-slug.js';
import { contractTagName, elementTypeFor } from './contract-utils.js';

const DESCRIPTION =
    'Wix Forms per-form contracts for agent discovery. Bind explicit field tags, e.g. ' +
    '{contact.email.label}, ref="contact.email.input". Tag names come from Wix field targets, ' +
    'which Wix often auto-generates (firstName_5820, formFieldAa5f): find a field by its label ' +
    'in tagByLabel, then bind its tag. Tags are stable; never rename them.';

/** The agent-kit `forms.yaml` content (without the generation timestamp). */
export function buildFormsReference(forms: ListedFormView[], namespace: string) {
    const slugById = computeFormSlugs(forms);
    return {
        _description: DESCRIPTION,
        namespace,
        totalForms: forms.length,
        forms: forms.map((form) => ({
            contract: `form/${slugById.get(form.id)}`,
            formId: form.id,
            name: form.name,
            tagByLabel: Object.fromEntries(
                form.fields.map((field) => [field.label, contractTagName(field.target)]),
            ),
            fields: form.fields.map(fieldReference),
        })),
    };
}

function fieldReference(field: FormFieldView) {
    return {
        tag: contractTagName(field.target),
        label: field.label,
        type: field.inputType,
        target: field.target,
        required: field.required,
        elementType: elementTypeFor(field),
        // DL#41 channel hints so agents discover the value/control surfaces.
        hidden: Boolean(field.hidden),
        hasControl: true,
        valueType: valueTypeFor(field),
    };
}

/** The runtime value type a field submits (DL#41 4c) — a hint for agent-kit discovery. */
function valueTypeFor(field: FormFieldView): 'string' | 'boolean' | 'string[]' {
    if (field.inputType === 'checkbox') return 'boolean';
    if (field.inputType === 'multiselect') return 'string[]';
    return 'string';
}
