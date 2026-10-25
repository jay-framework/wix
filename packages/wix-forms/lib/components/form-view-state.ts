/**
 * Per-form view-state mapping (DL#38, extended by DL#39).
 *
 * Turns the projected `FormFieldView[]` into a view-state object KEYED BY FIELD
 * TARGET — `{ email: { label, placeholder, required, error, invalid, value }, … }`
 * — plus the reserved form-level tags, matching the generated per-form contract.
 * Pure and framework-free so it can be unit-tested directly.
 *
 * DL#39 adds, per field, a live-validation `invalid` flag and a `value` echo (seeded
 * by prefill, updated on input), and a form-level `isSubmitted` flag that drives the
 * confirmation / sent-state view swap.
 */

import type { FieldValue, FormFieldView } from '../types.js';
import { contractTagName } from '../generators/contract-utils.js';

export interface FieldViewState {
    label: string;
    placeholder?: string;
    required: boolean;
    error: string;
    invalid: boolean;
    /** Text-like fields expose a string `value`; a checkbox exposes a boolean `value` variant. */
    value?: string | boolean;
    options?: Array<{ value: string; label: string; selected?: boolean }>;
}

export interface FormViewStateOverrides {
    isSubmitting: boolean;
    statusMessage: string;
    loadError: string;
    errorByTarget?: Record<string, string>;
    invalidByTarget?: Record<string, boolean>;
    valueByTarget?: Record<string, FieldValue>;
    isSubmitted?: boolean;
}

interface FieldState {
    error: string;
    invalid: boolean;
    value: FieldValue;
}

export function fieldToViewState(field: FormFieldView, state: FieldState): FieldViewState {
    const viewState: FieldViewState = {
        label: field.label,
        required: field.required,
        error: state.error,
        invalid: state.invalid,
    };
    if (field.inputType === 'checkbox') {
        viewState.value = state.value === true; // the boolean `value` variant
    } else if (field.inputType === 'select' || field.inputType === 'multiselect') {
        const selectedValues = Array.isArray(state.value) ? state.value : [];
        viewState.options = field.options.map((option) => {
            const optionView: { value: string; label: string; selected?: boolean } = {
                value: option.value,
                label: option.label,
            };
            if (field.inputType === 'multiselect') {
                optionView.selected = selectedValues.includes(option.value);
            }
            return optionView;
        });
    } else {
        viewState.placeholder = field.placeholder;
        viewState.value = typeof state.value === 'string' ? state.value : '';
    }
    return viewState;
}

/** The per-field view-state object, keyed by each field's contract tag. */
export function buildFieldsViewState(
    fields: FormFieldView[],
    errorByTarget: Record<string, string> = {},
    invalidByTarget: Record<string, boolean> = {},
    valueByTarget: Record<string, FieldValue> = {},
): Record<string, FieldViewState> {
    const viewState: Record<string, FieldViewState> = {};
    for (const field of fields) {
        viewState[contractTagName(field.target)] = fieldToViewState(field, {
            error: errorByTarget[field.target] ?? '',
            invalid: invalidByTarget[field.target] ?? false,
            value: valueByTarget[field.target] ?? '',
        });
    }
    return viewState;
}

/** Full view-state: per-field slots plus the reserved form-level tags. */
export function buildFormViewState(
    fields: FormFieldView[],
    overrides: FormViewStateOverrides,
): Record<string, unknown> {
    return {
        ...buildFieldsViewState(
            fields,
            overrides.errorByTarget,
            overrides.invalidByTarget,
            overrides.valueByTarget,
        ),
        isLoading: fields.length === 0 && !overrides.loadError,
        loadError: overrides.loadError,
        isSubmitting: overrides.isSubmitting,
        statusMessage: overrides.statusMessage,
        isSubmitted: overrides.isSubmitted ?? false,
    };
}
