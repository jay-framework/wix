/**
 * Contract YAML building blocks for per-form contract generation (DL#38).
 *
 * Small, self-contained helpers copied in the spirit of wix-data's
 * `contract-utils` so wix-forms stays independent of wix-data internals
 * (DL#38 §4). Each builder returns a YAML fragment at a given indent.
 */

import type { FormFieldView } from '../types.js';
import { camelCase } from './camel-case.js';

const INDENT = '  ';

/** `n` nesting levels of indentation (2 spaces each). */
function pad(level: number): string {
    return INDENT.repeat(level);
}

/** Interactive element type for a field, chosen per DL#38 §3 field-type mapping. */
export function elementTypeFor(field: FormFieldView): string {
    switch (field.inputType) {
        case 'textarea':
            return 'HTMLTextAreaElement';
        case 'select':
            return 'HTMLSelectElement';
        default:
            return 'HTMLInputElement';
    }
}

/**
 * Build the `sub-contract` tag for a single visible form field, named after
 * the field's `target`. Carries label/placeholder/required/error plus one
 * `input` interactive tag; select fields also get a repeated `options`
 * sub-contract.
 */
export function fieldTag(field: FormFieldView, level = 1): string {
    const item = pad(level);
    const prop = pad(level + 1);
    const child = pad(level + 2);
    const lines: string[] = [
        `${item}- tag: ${contractTagName(field.target)}`,
        `${prop}type: sub-contract`,
        `${prop}phase: fast+interactive`,
        `${prop}description: ${yamlInline(field.label || field.target)}`,
        `${prop}tags:`,
        `${child}- { tag: label, type: data, dataType: string }`,
    ];
    if (field.inputType !== 'select') {
        lines.push(`${child}- { tag: placeholder, type: data, dataType: string }`);
    }
    lines.push(`${child}- { tag: required, type: variant, dataType: boolean }`);
    lines.push(`${child}- { tag: error, type: data, dataType: string }`);
    lines.push(`${child}- { tag: input, type: interactive, elementType: ${elementTypeFor(field)} }`);
    if (field.inputType === 'select') {
        lines.push(...optionsSubContract(level + 2));
    }
    return lines.join('\n');
}

function optionsSubContract(level: number): string[] {
    const item = pad(level);
    const prop = pad(level + 1);
    const child = pad(level + 2);
    return [
        `${item}- tag: options`,
        `${prop}type: sub-contract`,
        `${prop}repeated: true`,
        `${prop}trackBy: value`,
        `${prop}tags:`,
        `${child}- { tag: value, type: data, dataType: string }`,
        `${child}- { tag: label, type: data, dataType: string }`,
    ];
}

/** Reserved form-level tags, kept at the top level (DL#38 §3). */
export function reservedFormTags(level = 1): string {
    const item = pad(level);
    return [
        `${item}- { tag: isLoading, type: variant, dataType: boolean, phase: fast+interactive }`,
        `${item}- { tag: loadError, type: data, dataType: string, phase: fast+interactive }`,
        `${item}- { tag: isSubmitting, type: variant, dataType: boolean, phase: fast+interactive }`,
        `${item}- { tag: statusMessage, type: data, dataType: string, phase: fast+interactive }`,
        `${item}- { tag: submitButton, type: interactive, elementType: HTMLButtonElement }`,
    ].join('\n');
}

/** Names reserved for form-level tags — a field whose target collides is suffixed (DL#38 OQ-3). */
export const RESERVED_TAG_NAMES = new Set([
    'isLoading',
    'loadError',
    'isSubmitting',
    'statusMessage',
    'submitButton',
]);

/**
 * The contract tag / view-state key / ref name for a field. The field's
 * `target` is camelCased to match how jay compiles every contract tag into its
 * ViewState accessor and ref name (Break B — otherwise a `first_name` target
 * renders `{form.firstName...}` bindings as `undefined`). If the camelCased
 * name then collides with a reserved form-level tag it is suffixed so both
 * remain bindable (DL#38 OQ-3). Shared by the generator and the component so
 * the generated tag, the compiled accessor, and the ref name all agree.
 */
export function contractTagName(target: string): string {
    const name = camelCase(target);
    return RESERVED_TAG_NAMES.has(name) ? `${name}Field` : name;
}

export function toPascalCase(value: string): string {
    return value
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

/** kebab-case a form name into a URL/binding-friendly slug. */
export function toKebabCase(value: string): string {
    return value
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

/** Quote a YAML scalar only when it could be misparsed. */
function yamlInline(value: string): string {
    if (value === '' || /[:#{}\[\],&*!|>'"%@`]/.test(value) || /^\s|\s$/.test(value)) {
        return JSON.stringify(value);
    }
    return value;
}
