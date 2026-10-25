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
        case 'multiselect':
            return 'HTMLSelectElement';
        default:
            return 'HTMLInputElement';
    }
}

/** Options-bearing field kinds share the repeated `options` sub-contract (DL#38 §3, DL#39 4c). */
function hasOptions(field: FormFieldView): boolean {
    return field.inputType === 'select' || field.inputType === 'multiselect';
}

/** A free-text field (placeholder + string `value`), as opposed to options/checkbox kinds. */
function isTextLike(field: FormFieldView): boolean {
    return !hasOptions(field) && field.inputType !== 'checkbox';
}

/**
 * The per-field value channel (DL#39 Capability 2 / 4c), modeled on supported primitive
 * `dataType`s only (an array is not a valid `dataType`):
 *  - checkbox → `value` variant (boolean), so markup can branch on checked state.
 *  - options-bearing (select / multiselect) → NO flat value tag; the selection is exposed
 *    through the repeated `options` sub-contract (multiselect adds a per-option `selected`).
 *  - text-like → `value` data (string).
 */
function valueTagLines(field: FormFieldView, child: string): string[] {
    if (field.inputType === 'checkbox') {
        return [`${child}- { tag: value, type: variant, dataType: boolean }`];
    }
    if (hasOptions(field)) {
        return [];
    }
    return [`${child}- { tag: value, type: data, dataType: string }`];
}

/**
 * Build the `sub-contract` tag for a single visible form field, named after the
 * field's `target`. Carries label/placeholder/value/required/error/invalid plus
 * `input` and `control` interactive tags; options-bearing fields also get a
 * repeated `options` sub-contract.
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
    if (isTextLike(field)) {
        lines.push(`${child}- { tag: placeholder, type: data, dataType: string }`);
    }
    lines.push(...valueTagLines(field, child));
    lines.push(`${child}- { tag: required, type: variant, dataType: boolean }`);
    lines.push(`${child}- { tag: error, type: data, dataType: string }`);
    lines.push(`${child}- { tag: invalid, type: variant, dataType: boolean }`);
    lines.push(`${child}- { tag: input, type: interactive, elementType: ${elementTypeFor(field)} }`);
    lines.push(`${child}- { tag: control, type: interactive, elementType: HTMLElement }`);
    if (hasOptions(field)) {
        lines.push(...optionsSubContract(field, level + 2));
    }
    return lines.join('\n');
}

/**
 * Hidden-field sub-contract (DL#39 Capability 4a) — a value + control channel only
 * (NO label/placeholder/input), so a page can populate a Wix hidden field it has a
 * value for. Emitted only for fields the projection marks `hidden`.
 */
export function hiddenFieldTag(field: FormFieldView, level = 1): string {
    const item = pad(level);
    const prop = pad(level + 1);
    const child = pad(level + 2);
    return [
        `${item}- tag: ${contractTagName(field.target)}`,
        `${prop}type: sub-contract`,
        `${prop}phase: fast+interactive`,
        `${prop}description: ${yamlInline(field.label || field.target)}`,
        `${prop}tags:`,
        `${child}- { tag: value, type: data, dataType: string }`,
        `${child}- { tag: control, type: interactive, elementType: HTMLElement }`,
    ].join('\n');
}

function optionsSubContract(field: FormFieldView, level: number): string[] {
    const item = pad(level);
    const prop = pad(level + 1);
    const child = pad(level + 2);
    const lines = [
        `${item}- tag: options`,
        `${prop}type: sub-contract`,
        `${prop}repeated: true`,
        `${prop}trackBy: value`,
        `${prop}tags:`,
        `${child}- { tag: value, type: data, dataType: string }`,
        `${child}- { tag: label, type: data, dataType: string }`,
    ];
    // A multiselect exposes its selection as a per-option boolean `selected` variant —
    // the sanctioned array representation (an array `dataType` is invalid) (DL#39 4c).
    if (field.inputType === 'multiselect') {
        lines.push(`${child}- { tag: selected, type: variant, dataType: boolean }`);
    }
    return lines;
}

/** Reserved form-level tags, kept at the top level (DL#38 §3, DL#39 Caps 1 + 4a). */
export function reservedFormTags(level = 1): string {
    const item = pad(level);
    return [
        `${item}- { tag: isLoading, type: variant, dataType: boolean, phase: fast+interactive }`,
        `${item}- { tag: loadError, type: data, dataType: string, phase: fast+interactive }`,
        `${item}- { tag: isSubmitting, type: variant, dataType: boolean, phase: fast+interactive }`,
        `${item}- { tag: isSubmitted, type: variant, dataType: boolean, phase: fast+interactive }`,
        `${item}- { tag: statusMessage, type: data, dataType: string, phase: fast+interactive }`,
        `${item}- { tag: submitButton, type: interactive, elementType: HTMLButtonElement }`,
        `${item}- { tag: resetButton, type: interactive, elementType: HTMLButtonElement }`,
        `${item}- { tag: honeypot, type: interactive, elementType: HTMLInputElement }`,
    ].join('\n');
}

/** Names reserved for form-level tags — a field whose target collides is suffixed (DL#38 OQ-3). */
export const RESERVED_TAG_NAMES = new Set([
    'isLoading',
    'loadError',
    'isSubmitting',
    'isSubmitted',
    'statusMessage',
    'submitButton',
    'resetButton',
    'honeypot',
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
