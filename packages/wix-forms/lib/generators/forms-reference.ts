import type { FormFieldView, ListedFormView } from '../types.js';
import { computeFormSlugs } from './form-slug.js';
import { contractTagName, elementTypeFor } from './contract-utils.js';
import { ADDRESS_PARTS } from '../address/address-types.js';

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
            // DL #51: fields left out of the contract, so an agent knows why a field is missing.
            unsupportedFields: form.unsupportedFields.map(
                ({ target, label, wixKind, required }) => ({
                    target,
                    label,
                    wixKind,
                    required,
                }),
            ),
        })),
    };
}

const LISTED_COUNTRIES_LIMIT = 10;

function fieldReference(field: FormFieldView) {
    if (field.inputType === 'address') return addressReference(field);
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

/** DL #52 §5: the parts every address contract carries, and its countries (a list when short). */
function addressReference(field: FormFieldView) {
    const countries = field.address?.countries.map((country) => country.value) ?? [];
    return {
        tag: contractTagName(field.target),
        label: field.label,
        type: 'address' as const,
        target: field.target,
        required: field.required,
        parts: [...ADDRESS_PARTS],
        countries: countries.length <= LISTED_COUNTRIES_LIMIT ? countries : countries.length,
        valueType: 'AddressValue',
    };
}

/** The runtime value type a field submits (DL#41 4c) — a hint for agent-kit discovery. */
function valueTypeFor(field: FormFieldView): 'string' | 'boolean' | 'string[]' {
    if (field.inputType === 'checkbox') return 'boolean';
    if (field.inputType === 'multiselect') return 'string[]';
    return 'string';
}
