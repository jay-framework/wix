/**
 * Pure store→submission projection (DL#41 §0 — the value-store spine).
 *
 * The interactive component holds ONE per-field value store keyed by the raw Wix
 * `field.target` (the submission key). `readFormValues` returns a projection of
 * that store, so the submit payload needs no reverse mapping. This module is the
 * pure, framework-free projection so it is unit-testable without a DOM harness.
 *
 * The store/projection value type is `FieldValue` (`string | string[] | boolean`;
 * DL#41 4c) so boolean checkboxes and multi-select arrays survive submission.
 */

import type { FieldValue, FormFieldInputType, FormFieldView } from '../types.js';
import { checkFormField } from '../utils/project-form-fields.js';
import { checkPhone } from '../utils/phone-normalization.js';
import { FieldRule, type FieldCheckResult } from './field-rule.js';

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
        const raw = field.target in store ? store[field.target] : emptyValueFor(field);
        values[field.target] = submittedValueOf(field, raw);
    }
    return values;
}

/** Visible text-like kinds whose surrounding whitespace is not part of the value (DL #57 T). */
const TRIMMED_KINDS = new Set<FormFieldInputType>(['text', 'textarea', 'email', 'tel', 'url']);

/**
 * The value as submitted: trimmed for a visible text-like string, otherwise unchanged (DL #57 T).
 * The only place the trim rule is written; validation already ignores surrounding whitespace.
 */
export function submittedValueOf(field: FormFieldView, raw: FieldValue): FieldValue {
    const isTrimmed =
        !field.hidden && TRIMMED_KINDS.has(field.inputType) && typeof raw === 'string';
    return isTrimmed ? (raw as string).trim() : raw;
}

/** The store with every visible text-like string trimmed (the confirmation echo, DL #57 T). */
export function trimTextValues(fields: FormFieldView[], store: FieldStore): FieldStore {
    const trimmed: FieldStore = { ...store };
    for (const field of fields) {
        if (field.target in store)
            trimmed[field.target] = submittedValueOf(field, store[field.target]);
    }
    return trimmed;
}

/**
 * The cleared value store for a form reset ("send another", DL#41 Capability 1) — every
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

/** One checkbox change in a multiselect's option group (DL#44 §2). */
export interface OptionToggle {
    current: FieldValue;
    optionValue: string;
    checked: boolean;
}

/**
 * Next multiselect selection after one option is checked or unchecked (DL#44 §2), in option
 * order, without duplicates; values that are not options of the field are dropped.
 */
export function toggleSelection(
    field: FormFieldView,
    { current, optionValue, checked }: OptionToggle,
): string[] {
    const selected = new Set(Array.isArray(current) ? current : []);
    if (checked) selected.add(optionValue);
    else selected.delete(optionValue);
    return field.options.map((option) => option.value).filter((value) => selected.has(value));
}

/**
 * One page-provided control value read from the DOM, with the field's dirty state (DL#41 4a).
 * `value` is `undefined` when the control is not bound (its `exec$` resolved nothing).
 */
export interface ControlSeed {
    target: string;
    value: FieldValue | undefined;
    dirty: boolean;
}

/** The seeded store and the targets whose value the seed changed (DL#53 G5). */
export interface SeedResult {
    store: FieldStore;
    changedTargets: string[];
}

/**
 * Page-provided control values win over the store for every field the user has not edited
 * (DL#53 G5 — hidden fields and custom-UI defaults follow the page). Dirty fields and unbound
 * controls are skipped; '' from a bound control clears the slot.
 *
 * This is the pure decision behind the mount, reset and submit seeds (the impure DOM read of
 * each control's `data-value` lives in the component).
 */
export function seedControlValues(store: FieldStore, seeds: ControlSeed[]): SeedResult {
    const seeded = { ...store };
    const changedTargets: string[] = [];
    for (const { target, value, dirty } of seeds) {
        if (dirty || value === undefined) continue;
        if (!sameFieldValue(seeded[target], value)) changedTargets.push(target);
        seeded[target] = value;
    }
    return { store: seeded, changedTargets };
}

function sameFieldValue(current: FieldValue | undefined, next: FieldValue): boolean {
    if (Array.isArray(current) && Array.isArray(next)) {
        return (
            current.length === next.length && current.every((item, index) => item === next[index])
        );
    }
    return current === next;
}

/**
 * Submit-time client validation (DL#41 planned fix). Hidden fields are skipped: they have
 * no error tag to show a message, and Wix re-validates them on the server. `check` defaults to
 * the built-in rules; the component passes its own, which adds the page checks (DL#53 G1).
 */
export function validateVisibleFields(
    fields: FormFieldView[],
    values: Record<string, FieldValue>,
    check: (field: FormFieldView, value: FieldValue) => FieldCheckResult = checkFormField,
): Record<string, FieldCheckResult> {
    const failures: Record<string, FieldCheckResult> = {};
    for (const field of fields) {
        if (field.hidden) continue;
        const result = check(field, values[field.target] ?? emptyValueFor(field));
        if (result.rule !== FieldRule.NONE) failures[field.target] = result;
    }
    return failures;
}

/**
 * The values to post (DL#55 P1c): every tel value (visible or hidden) that `checkPhone` can
 * convert is sent as E.164, which Wix's caller path requires; every other value passes through.
 * The store and the inputs keep what the visitor typed.
 */
export function toPostedValues(
    fields: FormFieldView[],
    values: Record<string, FieldValue>,
): Record<string, FieldValue> {
    const posted = { ...values };
    for (const field of fields) {
        const value = posted[field.target];
        if (field.inputType !== 'tel' || typeof value !== 'string') continue;
        posted[field.target] = postedPhone(value, field);
    }
    return posted;
}

function postedPhone(value: string, field: FormFieldView): string {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    const phone = checkPhone(trimmed, field.phone);
    return phone.rule === FieldRule.NONE ? phone.e164 : value;
}
