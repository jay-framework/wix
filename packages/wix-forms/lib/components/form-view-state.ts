/**
 * Per-form view-state mapping (DL#40, extended by DL#41).
 *
 * Turns the projected `FormFieldView[]` into a view-state object KEYED BY FIELD
 * TARGET — `{ email: { label, placeholder, required, error, invalid, value }, … }`
 * — plus the reserved form-level tags, matching the generated per-form contract.
 * Pure and framework-free so it can be unit-tested directly.
 *
 * DL#41 adds, per field, a live-validation `invalid` flag and a `value` echo (seeded
 * by prefill, updated on input), and a form-level `isSubmitted` flag that drives the
 * confirmation / sent-state view swap.
 */

import type { FieldValue, FormFieldOptionView, FormFieldView } from '../types.js';
import {
    ADDRESS_PARTS,
    LAYOUT_PARTS,
    type AddressLayout,
    type AddressPart,
    type AddressValue,
    type LayoutPart,
} from '../address/address-types.js';
import { addressErrorKey, isAddressValue, layoutOf } from '../address/address-value.js';
import { SubmitFailure, SubmitState } from './submit-outcome.js';
import { FieldRule } from './field-rule.js';
import { contractTagName } from '../generators/contract-utils.js';

export interface FieldViewState {
    label: string;
    placeholder?: string;
    required: boolean;
    error: string;
    invalid: boolean;
    /** Which rule the shown `error` comes from (DL#53 G1); `NONE` when there is none. */
    errorRule: FieldRule;
    /** Text-like fields expose a string `value`; a checkbox exposes a boolean `value` variant. */
    value?: string | boolean;
    options?: Array<{ value: string; label: string; selected?: boolean }>;
}

export interface FormViewStateOverrides {
    isSubmitting: boolean;
    /** The submit was handed to the server (DL #57 G6); absent means false. */
    isHandedOff?: boolean;
    statusMessage: string;
    loadError: string;
    errorByTarget?: Record<string, string>;
    invalidByTarget?: Record<string, boolean>;
    ruleByTarget?: Record<string, FieldRule>;
    valueByTarget?: Record<string, FieldValue>;
    isSubmitted?: boolean;
    submitFailure?: SubmitFailure;
}

interface FieldState {
    error: string;
    invalid: boolean;
    errorRule: FieldRule;
    value: FieldValue;
}

function fieldToViewState(field: FormFieldView, state: FieldState): FieldViewState {
    const viewState: FieldViewState = {
        label: field.label,
        required: field.required,
        error: state.error,
        invalid: state.invalid,
        errorRule: state.errorRule,
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
    ruleByTarget: Record<string, FieldRule> = {},
): Record<string, FieldViewState> {
    const viewState: Record<string, FieldViewState> = {};
    for (const field of fields) {
        viewState[contractTagName(field.target)] = fieldToViewState(field, {
            error: errorByTarget[field.target] ?? '',
            invalid: invalidByTarget[field.target] ?? false,
            errorRule: ruleByTarget[field.target] ?? FieldRule.NONE,
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
            overrides.ruleByTarget,
        ),
        isLoading: fields.length === 0 && !overrides.loadError,
        loadError: overrides.loadError,
        isSubmitting: overrides.isSubmitting,
        statusMessage: overrides.statusMessage,
        isSubmitted: overrides.isSubmitted ?? false,
        submitState: submitStateOf(overrides),
        submitFailure: overrides.submitFailure ?? SubmitFailure.NONE,
    };
}

/**
 * Success wins over the hand-off, which a redirect keeps set while the page navigates. SUBMITTING
 * means handed to the server, not busy (DL #57 G6): no fallback to `isSubmitting`.
 */
function submitStateOf(overrides: FormViewStateOverrides): SubmitState {
    if (overrides.isSubmitted) return SubmitState.SUCCEEDED;
    if (overrides.isHandedOff === true) return SubmitState.SUBMITTING;
    if (overrides.submitFailure) return SubmitState.FAILED;
    return SubmitState.IDLE;
}

/** One part of the address view state (DL #52 §2). */
export interface AddressPartViewState {
    shown: boolean;
    required: boolean;
    label: string;
    value: string;
    error: string;
    invalid: boolean;
    maxLength?: number;
    listed?: boolean;
    options?: FormFieldOptionView[];
}

export interface AddressViewState {
    label: string;
    required: boolean;
    /** The first part error, in part order. */
    error: string;
    invalid: boolean;
    country: Omit<AddressPartViewState, 'shown' | 'required' | 'maxLength' | 'listed'> & {
        options: FormFieldOptionView[];
    };
    [part: string]: unknown;
}

/**
 * The address subtree (DL #52 §2): every part, shown or not, so a page can bind all eight. With no
 * country, only the country select has content. `errors` is keyed `<target>/<part>`.
 */
export function addressViewState(
    field: FormFieldView,
    value: FieldValue | undefined,
    errors: Record<string, string> = {},
): AddressViewState {
    const spec = field.address!;
    const address: AddressValue = isAddressValue(value) ? value : {};
    const layout = layoutOf(spec, address.country);
    const errorOf = (part: AddressPart) => errors[addressErrorKey(field.target, part)] ?? '';
    const firstError = ADDRESS_PARTS.map(errorOf).find(Boolean) ?? '';
    const view: AddressViewState = {
        label: field.label,
        required: field.required,
        error: firstError,
        invalid: Boolean(firstError),
        country: {
            label: spec.partLabels.country,
            value: address.country ?? '',
            error: errorOf('country'),
            invalid: Boolean(errorOf('country')),
            options: spec.countries,
        },
    };
    for (const part of LAYOUT_PARTS) {
        view[part] = partViewState(part, layout, address, errorOf(part));
    }
    return view;
}

function partViewState(
    part: LayoutPart,
    layout: AddressLayout | undefined,
    address: AddressValue,
    error: string,
): AddressPartViewState {
    const partSpec = layout?.parts.find((candidate) => candidate.part === part);
    const view: AddressPartViewState = {
        shown: Boolean(partSpec),
        required: partSpec?.required ?? false,
        label: partSpec?.label ?? '',
        value: partSpec ? (address[part] ?? '') : '',
        error,
        invalid: Boolean(error),
    };
    if (part === 'subdivision') {
        const options = partSpec ? (layout?.subdivisions ?? []) : [];
        view.listed = options.length > 0;
        view.options = options;
    } else {
        view.maxLength = partSpec?.maxLength ?? 0;
    }
    return view;
}
