/**
 * The non-key view data of a supported field (DL #51, `readFieldView` paths). Never affects
 * classification; called only for fields `classifyFormField` supports.
 */

import type { FormFieldOptionView } from '../types.js';
import type { AddressFieldSpec } from '../address/address-types.js';
import type { RawFormField } from '../wix-apis/get-form.js';
import { componentOptionsOf, type FieldKey } from './classify-form-field.js';

export interface FieldViewData {
    placeholder: string;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    options: FormFieldOptionView[];
    /** An address field's resolved spec (DL #52); set by the projection, which has the templates. */
    address?: AddressFieldSpec;
}

export function readFieldView(raw: RawFormField, key: FieldKey): FieldViewData {
    const stringValidation = raw.inputOptions?.stringOptions?.validation;
    const placeholder = raw.inputOptions?.stringOptions
        ? componentOptionsOf(raw)?.placeholder
        : undefined;
    return {
        placeholder: placeholder ?? '',
        minLength: stringValidation?.minLength,
        maxLength: stringValidation?.maxLength,
        pattern: stringValidation?.pattern,
        options: readOptions(raw, key),
    };
}

/** The enum is what Wix accepts (F6): one option per enum value, labelled from the options list. */
function readOptions(raw: RawFormField, key: FieldKey): FormFieldOptionView[] {
    const labelByValue = new Map<string, string>();
    for (const option of componentOptionsOf(raw)?.options ?? []) {
        if (option.value !== undefined && option.label)
            labelByValue.set(option.value, option.label);
    }
    return key.enumValues.map((value) => ({ value, label: labelByValue.get(value) ?? value }));
}
