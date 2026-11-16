/**
 * Fail-closed field classification (DL #51, classification table). Only the documented
 * `formFields[]` shape is read; a field is supported only when its observed Get Form tuple
 * (`inputType` + `componentType` + `format`) matches a row. First matching row wins.
 */

import type { FormFieldInputType } from '../types.js';
import type {
    RawComponentOptions,
    RawFieldLabel,
    RawFormField,
    RawTypeOptions,
    RichContentNode,
} from '../wix-apis/get-form.js';

export interface FieldKey {
    id: string;
    fieldType: 'INPUT' | 'DISPLAY';
    identifier?: string;
    target?: string;
    hidden: boolean;
    readOnly: boolean;
    /** A custom ("Other") option allows values outside the enum (rows 9, 12 → row 14). */
    customOption: boolean;
    required: boolean;
    inputType?: string;
    componentType?: string;
    /** `'UNKNOWN_FORMAT'` when Wix sends none (the documented default). */
    format: string;
    itemType?: string;
    enumValues: string[];
    label: string;
}

export type FieldIgnoreReason = 'display' | 'no-target';

const UNKNOWN_FORMAT = 'UNKNOWN_FORMAT';
const CHOICE_OPTIONS_KEYS = ['dropdownOptions', 'radioGroupOptions', 'checkboxGroupOptions'];

export function readFieldKey(raw: RawFormField): FieldKey {
    const inputOptions = raw.inputOptions ?? {};
    const typeOptions = typeOptionsOf(raw);
    const target = inputOptions.target || undefined;
    return {
        id: raw.id ?? '',
        fieldType: raw.fieldType === 'DISPLAY' ? 'DISPLAY' : 'INPUT',
        identifier: raw.identifier,
        target,
        hidden: Boolean(raw.hidden),
        readOnly: inputOptions.readOnly ?? false,
        customOption: hasCustomOption(raw),
        required: inputOptions.required ?? false,
        inputType: inputOptions.inputType,
        componentType: typeOptions?.componentType,
        format: typeOptions?.validation?.format ?? UNKNOWN_FORMAT,
        itemType: inputOptions.arrayOptions?.validation?.items?.itemType,
        enumValues: readEnumValues(raw),
        label: readLabelText(componentOptionsOf(raw)?.label) || target || raw.id || '',
    };
}

/** Rows 1-2: fields that are not inputs a visitor can submit. */
export function ignoreReasonOf(key: FieldKey): FieldIgnoreReason | undefined {
    if (key.fieldType === 'DISPLAY') return 'display';
    if (!key.target) return 'no-target';
    return undefined;
}

/** Rows 3a-14, per-form column; undefined = unsupported. Row 3 (`hidden`) is a marker, not a row. */
export function classifyFormField(key: FieldKey): FormFieldInputType | undefined {
    if (key.readOnly) return undefined;
    switch (key.inputType) {
        case 'STRING':
            return classifyStringField(key);
        case 'BOOLEAN':
            return key.componentType === 'CHECKBOX' ? 'checkbox' : undefined;
        case 'ARRAY':
            return isClosedChoice(key) &&
                key.componentType === 'CHECKBOX_GROUP' &&
                key.itemType === 'STRING'
                ? 'multiselect'
                : undefined;
        default:
            return undefined;
    }
}

/** `"<inputType>/<componentType>[/<format>]"`, e.g. `ADDRESS/MULTILINE_ADDRESS`; a missing part reads `?`. */
export function wixKindOf(key: FieldKey): string {
    const kind = `${key.inputType ?? '?'}/${key.componentType ?? '?'}`;
    return key.format === UNKNOWN_FORMAT ? kind : `${kind}/${key.format}`;
}

/** Rows 4-10. */
function classifyStringField(key: FieldKey): FormFieldInputType | undefined {
    const format = key.format;
    switch (key.componentType) {
        case 'TEXT_INPUT':
            if (format === UNKNOWN_FORMAT)
                return key.identifier === 'TEXT_AREA' ? 'textarea' : 'text';
            if (format === 'EMAIL') return 'email';
            if (format === 'URL') return 'url';
            return undefined;
        case 'PHONE_INPUT':
            return format === 'PHONE' ? 'tel' : undefined;
        case 'DROPDOWN':
        case 'RADIO_GROUP':
            return format === UNKNOWN_FORMAT && isClosedChoice(key) ? 'select' : undefined;
        case 'DATE_PICKER':
            // Kept as text, as before DL #51: Wix validates the DATE format itself.
            return format === 'DATE' ? 'text' : undefined;
        default:
            return undefined;
    }
}

/** A choice limited to its enum: values outside it are rejected by Wix (F6). */
function isClosedChoice(key: FieldKey): boolean {
    return key.enumValues.length > 0 && !key.customOption;
}

/** `<type>Options` is named after the input type: `STRING` → `stringOptions`, `WIX_FILE` → `wixFileOptions`. */
function typeOptionsOf(raw: RawFormField): RawTypeOptions | undefined {
    const inputType = raw.inputOptions?.inputType;
    if (!inputType) return undefined;
    const options = raw.inputOptions as Record<string, unknown>;
    return options[optionsKeyOf(inputType)] as RawTypeOptions | undefined;
}

/** `<component>Options` inside the type options: `TEXT_INPUT` → `textInputOptions`. */
export function componentOptionsOf(raw: RawFormField): RawComponentOptions | undefined {
    const typeOptions = typeOptionsOf(raw);
    const componentType = typeOptions?.componentType;
    if (!componentType) return undefined;
    return typeOptions[optionsKeyOf(componentType)] as RawComponentOptions | undefined;
}

function optionsKeyOf(upperSnakeName: string): string {
    const camel = upperSnakeName
        .toLowerCase()
        .replace(/_([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
    return `${camel}Options`;
}

function hasCustomOption(raw: RawFormField): boolean {
    const typeOptions = [raw.inputOptions?.stringOptions, raw.inputOptions?.arrayOptions];
    return typeOptions.some((options) =>
        CHOICE_OPTIONS_KEYS.some(
            (key) => (options?.[key] as RawComponentOptions | undefined)?.customOption != null,
        ),
    );
}

/** String choices only: a checkbox's boolean enum (`[true]`) is not a choice list (row 11). */
function readEnumValues(raw: RawFormField): string[] {
    const values =
        raw.inputOptions?.stringOptions?.validation?.enum ??
        raw.inputOptions?.arrayOptions?.validation?.items?.stringOptions?.enum ??
        [];
    return values.filter((value): value is string => typeof value === 'string' && value !== '');
}

export function readLabelText(label: RawFieldLabel | undefined): string {
    if (label === undefined) return '';
    if (typeof label === 'string') return label;
    return collectRichText(label).trim();
}

function collectRichText(node: RichContentNode): string {
    const ownText = node.textData?.text ?? '';
    return ownText + (node.nodes ?? []).map(collectRichText).join('');
}
