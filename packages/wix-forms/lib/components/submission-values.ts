/**
 * Pure store→submission projection (DL#39 §0 — the value-store spine).
 *
 * The interactive component holds ONE per-field value store keyed by the raw Wix
 * `field.target` (the submission key). `readFormValues` returns a projection of
 * that store, so the submit payload needs no reverse mapping. This module is the
 * pure, framework-free projection so it is unit-testable without a DOM harness.
 *
 * The store/projection value type is `FieldValue` (`string | string[] | boolean`;
 * DL#39 4c) so boolean checkboxes and multi-select arrays survive submission.
 */

import type { FieldValue, FormFieldView } from '../types.js';

/** The per-field value store, keyed by `field.target`. */
export type FieldStore = Record<string, FieldValue>;

/** The empty value for a field that was never touched, chosen by its input kind. */
export function emptyValueFor(field: FormFieldView): FieldValue {
    if (field.inputType === 'checkbox') return false;
    if (field.inputType === 'multiselect') return [];
    return '';
}

/**
 * Project the value store into the submission payload — one entry per projected
 * field (visible and hidden), using the field's stored value or its kind-specific
 * empty value when the field was never touched.
 */
export function projectSubmissionValues(
    fields: FormFieldView[],
    store: FieldStore,
): Record<string, FieldValue> {
    const values: Record<string, FieldValue> = {};
    for (const field of fields) {
        values[field.target] = field.target in store ? store[field.target] : emptyValueFor(field);
    }
    return values;
}

/**
 * The cleared value store for a form reset ("send another", DL#39 Capability 1) — every
 * field at its kind-specific empty value (text → '', checkbox → false, multiselect → []).
 *
 * Making the reset store explicit per field (rather than an opaque `{}`) keeps the submit
 * projection, the per-field `value` echo, and the native-input reflect in agreement: a
 * cleared store yields cleared inputs. It is the pure counterpart of the component's
 * reset, so the "what each field clears to" decision is unit-testable without a DOM.
 */
export function emptyStoreFor(fields: FormFieldView[]): FieldStore {
    const store: FieldStore = {};
    for (const field of fields) {
        store[field.target] = emptyValueFor(field);
    }
    return store;
}

/** One page-provided control value read from the DOM, with the field's dirty state (DL#39 4a). */
export interface ControlSeed {
    target: string;
    value: FieldValue;
    dirty: boolean;
}

/**
 * Seed page-provided control values into the store (DL#39 4a — hidden fields and
 * custom-UI defaults). A control seeds its slot only when it carries a non-empty value
 * and the user has not already edited that field; values already in the store are kept.
 *
 * This is the pure decision behind the hydration-time seeding (the impure DOM read of
 * each control's `data-value` lives in the component). It exists so a hidden required
 * field's value reliably reaches the submission store before client validation runs.
 */
export function seedControlValues(store: FieldStore, seeds: ControlSeed[]): FieldStore {
    const seeded = { ...store };
    for (const { target, value, dirty } of seeds) {
        if (dirty || target in seeded || !hasValue(value)) {
            continue;
        }
        seeded[target] = value;
    }
    return seeded;
}

function hasValue(value: FieldValue): boolean {
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value === true;
}
