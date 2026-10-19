/**
 * Per-form view-state mapping (DL#36).
 *
 * Turns the projected `FormFieldView[]` into a view-state object KEYED BY FIELD
 * TARGET — `{ email: { label, placeholder, required, error }, country: { …, options } }`
 * — plus the reserved form-level tags, matching the generated per-form contract.
 * Pure and framework-free so it can be unit-tested directly.
 */

import type { FormFieldView } from '../types.js';
import { contractTagName } from '../generators/contract-utils.js';

export interface FieldViewState {
    label: string;
    placeholder?: string;
    required: boolean;
    error: string;
    options?: Array<{ value: string; label: string }>;
}

export interface FormViewStateOverrides {
    isSubmitting: boolean;
    statusMessage: string;
    loadError: string;
    errorByTarget?: Record<string, string>;
}

export function fieldToViewState(field: FormFieldView, error: string): FieldViewState {
    const viewState: FieldViewState = {
        label: field.label,
        required: field.required,
        error,
    };
    if (field.inputType === 'select') {
        viewState.options = field.options.map((option) => ({
            value: option.value,
            label: option.label,
        }));
    } else {
        viewState.placeholder = field.placeholder;
    }
    return viewState;
}

/** The per-field view-state object, keyed by each field's contract tag. */
export function buildFieldsViewState(
    fields: FormFieldView[],
    errorByTarget: Record<string, string> = {},
): Record<string, FieldViewState> {
    const viewState: Record<string, FieldViewState> = {};
    for (const field of fields) {
        viewState[contractTagName(field.target)] = fieldToViewState(
            field,
            errorByTarget[field.target] ?? '',
        );
    }
    return viewState;
}

/** Full view-state: per-field slots plus the reserved form-level tags. */
export function buildFormViewState(
    fields: FormFieldView[],
    overrides: FormViewStateOverrides,
): Record<string, unknown> {
    return {
        ...buildFieldsViewState(fields, overrides.errorByTarget),
        isLoading: fields.length === 0 && !overrides.loadError,
        loadError: overrides.loadError,
        isSubmitting: overrides.isSubmitting,
        statusMessage: overrides.statusMessage,
    };
}
