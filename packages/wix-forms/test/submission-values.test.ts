// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
    emptyStoreFor,
    projectSubmissionValues,
    seedControlValues,
    toggleSelection,
    toPostedValues,
    validateVisibleFields,
    type ControlSeed,
} from '../lib/components/submission-values.js';
import { FieldRule } from '../lib/components/field-rule.js';
import type { FieldValue, FormFieldView, PhoneRules } from '../lib/types.js';
import { checkFormField } from '../lib/utils/project-form-fields.js';

function textField(target: string): FormFieldView {
    return {
        target,
        label: target,
        inputType: 'text',
        required: false,
        placeholder: '',
        options: [],
    };
}

function checkboxField(target: string): FormFieldView {
    return {
        target,
        label: target,
        inputType: 'checkbox',
        required: false,
        placeholder: '',
        options: [],
    };
}

function multiselectField(target: string): FormFieldView {
    return {
        target,
        label: target,
        inputType: 'multiselect',
        required: false,
        placeholder: '',
        options: [],
    };
}

describe('projectSubmissionValues', () => {
    it('should project each field from the store, keyed by its raw target', () => {
        const fields = [textField('first_name'), textField('email')];
        const store = { first_name: 'Ada', email: 'ada@example.com' };

        expect(projectSubmissionValues(fields, store)).toEqual({
            first_name: 'Ada',
            email: 'ada@example.com',
        });
    });

    it('should default an untouched field to an empty string', () => {
        const fields = [textField('first_name'), textField('email')];
        const store = { first_name: 'Ada' };

        expect(projectSubmissionValues(fields, store)).toEqual({
            first_name: 'Ada',
            email: '',
        });
    });

    it('should include only projected fields, ignoring stray store keys', () => {
        const fields = [textField('email')];
        const store = { email: 'ada@example.com', honeypot: 'bot', stray: 'x' };

        expect(projectSubmissionValues(fields, store)).toEqual({ email: 'ada@example.com' });
    });

    it('should return an empty payload for a form with no fields', () => {
        expect(projectSubmissionValues([], { anything: 'x' })).toEqual({});
    });

    /**
     * Bug (DL#41 4c, test 1 — TYPE-LEVEL check, not a vitest-runtime reproduction):
     *   a boolean/consent checkbox value is coerced to a string by the Record<string,string>
     *   submit path, so the submission cannot carry the field's checked state as a boolean.
     * Found in: design-log/39 - general forms infrastructure.md §Design 4c; projection/submit
     *   path is Record<string,string> (submission-values.ts, create-submission.ts).
     * Expected: projecting a store whose `consent` slot is boolean `true` yields `true`
     *   (boolean), and `false` when unchecked — the checked state, not a static string.
     * Actual (pre-fix): the projection is TYPED Record<string,string>, so a boolean payload
     *   is a compile error (type-level red, caught by `tsc`); at runtime JS keeps the boolean
     *   unchanged, so this assertion passes in vitest. The real DOM-read corruption
     *   (element.value vs .checked) is provable only by the browser demo, not this unit test.
     */
    it('should preserve a boolean checkbox value (not stringify it)', () => {
        const fields = [checkboxField('consent')];
        expect(projectSubmissionValues(fields, { consent: true })).toEqual({ consent: true });
        expect(projectSubmissionValues(fields, { consent: false })).toEqual({ consent: false });
    });

    /**
     * Bug (DL#41 4c, test 2 — TYPE-LEVEL check, not a vitest-runtime reproduction):
     *   a multiselect value is truncated to a single string by the Record<string,string>
     *   submit path, so the submission cannot carry all selected values.
     * Found in: design-log/39 - general forms infrastructure.md §Design 4c.
     * Expected: projecting a store whose `interests` slot is `['a','b']` yields the
     *   2-element string[] `['a','b']`.
     * Actual (pre-fix): the Record<string,string> projection cannot be typed to hold an
     *   array — a compile error (type-level red); at runtime JS holds the array unchanged.
     */
    it('should preserve a multiselect array value (not truncate it)', () => {
        const fields = [multiselectField('interests')];
        expect(projectSubmissionValues(fields, { interests: ['a', 'b'] })).toEqual({
            interests: ['a', 'b'],
        });
    });
});

describe('emptyStoreFor', () => {
    /**
     * Bug (DL#41 Capability 1 reset — browser QA): after a successful submit, clicking the
     *   resetButton ("Send another") brought the form back (isSubmitted=false) but the native
     *   inputs stayed PRE-FILLED with the previously submitted values instead of blank.
     * Found in: design-log/39 - general forms infrastructure.md §Implementation Results
     *   (Reset DOM-clear fix). The DOM-timing half (exec$ against the re-mounted node) has no
     *   unit harness; this covers the pure reset decision — what each field clears to — so a
     *   cleared store yields cleared inputs when reflected on re-mount.
     * Expected: text/email/etc → '', checkbox → false, multiselect → [] (its kind's empty value).
     * Actual (pre-fix): no such function existed; reset set the store to an opaque `{}`.
     */
    it('should clear every field to its kind-specific empty value', () => {
        const fields = [
            textField('email'),
            checkboxField('consent'),
            multiselectField('interests'),
        ];
        expect(emptyStoreFor(fields)).toEqual({ email: '', consent: false, interests: [] });
    });

    it('should return an empty store for a form with no fields', () => {
        expect(emptyStoreFor([])).toEqual({});
    });
});

describe('seedControlValues', () => {
    /**
     * Bug (DL#41 Phase-9 browser QA): a hidden control-channel field
     *   (`<input type="hidden" ref="contact.propertyId.control" data-value="{routeValue}">`)
     *   rendered the correct value but its value never reached the submission store at
     *   hydration, so submit-time required-field validation failed silently (no DOM error
     *   is bound to a hidden field) and the form never POSTed.
     * Found in: design-log/39 - general forms infrastructure.md §Implementation Results
     *   (Browser-QA defects fixed); the construction-time `exec$` read resolved to
     *   `undefined` because the ref element is not yet bound during component construction.
     * Expected: a non-empty control value for an untouched field IS seeded into the store.
     * Actual (pre-fix): the store stayed empty for the hidden control field.
     */
    it('should seed a hidden control value into an empty store', () => {
        const seeds: ControlSeed[] = [{ target: 'propertyId', value: 'prop-123', dirty: false }];
        expect(seedControlValues({}, seeds)).toEqual({
            store: { propertyId: 'prop-123' },
            changedTargets: ['propertyId'],
        });
    });

    it('should not overwrite a field the user already edited', () => {
        const seeds: ControlSeed[] = [{ target: 'email', value: 'default@x.com', dirty: true }];
        expect(seedControlValues({ email: 'typed@x.com' }, seeds)).toEqual({
            store: { email: 'typed@x.com' },
            changedTargets: [],
        });
    });

    /** Intentional rewrite (DL#53 G5): a bound control's '' now clears its slot. */
    it('should clear the slot for an empty bound control value', () => {
        const seeds: ControlSeed[] = [{ target: 'propertyId', value: '', dirty: false }];
        expect(seedControlValues({}, seeds)).toEqual({
            store: { propertyId: '' },
            changedTargets: ['propertyId'],
        });
    });

    it('should leave existing store values untouched', () => {
        const seeds: ControlSeed[] = [{ target: 'propertyId', value: 'prop-123', dirty: false }];
        expect(seedControlValues({ email: 'ada@x.com' }, seeds)).toEqual({
            store: { email: 'ada@x.com', propertyId: 'prop-123' },
            changedTargets: ['propertyId'],
        });
    });

    /**
     * Bug: a stored, non-dirty control value is never refreshed (DL#53 G5).
     * Found in: design-log/53 §Problem G5 (`target in seeded`, `submission-values.ts:99`).
     * Expected: the page's current value replaces the stored one.
     * Actual: the first seeded value is kept, so a resubmit posts a stale value.
     */
    it('should overwrite a stored value of a field the user has not edited', () => {
        const seeds: ControlSeed[] = [{ target: 'slotId', value: 's-42', dirty: false }];
        expect(seedControlValues({ slotId: 's-1' }, seeds)).toEqual({
            store: { slotId: 's-42' },
            changedTargets: ['slotId'],
        });
    });

    /**
     * Bug: a cleared control can never clear its slot (DL#53 G5).
     * Found in: design-log/53 §Problem G5 (`!hasValue(value)`, `submission-values.ts:99`).
     * Expected: '' from a bound control clears the stored value.
     * Actual: the stored value stays.
     */
    it('should clear a stored value when a bound control is emptied', () => {
        const seeds: ControlSeed[] = [{ target: 'slotId', value: '', dirty: false }];
        expect(seedControlValues({ slotId: 's-1' }, seeds)).toEqual({
            store: { slotId: '' },
            changedTargets: ['slotId'],
        });
    });

    it('should skip an unbound control', () => {
        const seeds: ControlSeed[] = [{ target: 'slotId', value: undefined, dirty: false }];
        expect(seedControlValues({ slotId: 's-1' }, seeds)).toEqual({
            store: { slotId: 's-1' },
            changedTargets: [],
        });
    });

    it('should keep a dirty field even when its stored value differs', () => {
        const seeds: ControlSeed[] = [{ target: 'email', value: 'page@x.com', dirty: true }];
        expect(seedControlValues({ email: 'typed@x.com' }, seeds)).toEqual({
            store: { email: 'typed@x.com' },
            changedTargets: [],
        });
    });

    it('should not report an unchanged value as changed', () => {
        const seeds: ControlSeed[] = [{ target: 'tags', value: ['a', 'b'], dirty: false }];
        expect(seedControlValues({ tags: ['a', 'b'] }, seeds)).toEqual({
            store: { tags: ['a', 'b'] },
            changedTargets: [],
        });
    });
});

describe('validateVisibleFields', () => {
    function requiredField(target: string, hidden: boolean): FormFieldView {
        return { ...textField(target), label: target, required: true, hidden };
    }

    /**
     * Bug: a required hidden field the page left empty blocks submit with nothing shown.
     * Found in: design-log/39 - general forms infrastructure.md, "Known defect found in review + planned fix"
     * Expected: client validation skips hidden fields (no error tag exists to show one);
     *   Wix re-validates them server-side.
     * Actual: the submit loop validates hidden fields too, so submit silently stops.
     */
    it('should not report an empty required hidden field', () => {
        const fields = [requiredField('reference', true)];

        expect(validateVisibleFields(fields, { reference: '' })).toEqual({});
    });

    it('should report an empty required visible field', () => {
        const fields = [requiredField('first_name', false), requiredField('reference', true)];

        expect(validateVisibleFields(fields, { first_name: '', reference: '' })).toEqual({
            first_name: { rule: FieldRule.REQUIRED, message: 'first_name is required.' },
        });
    });

    it('should run the given check on visible fields only, with the submitted value', () => {
        const fields = [requiredField('first_name', false), requiredField('reference', true)];
        const check = vi.fn((field: FormFieldView, value: FieldValue) =>
            value === 'Bob'
                ? { rule: FieldRule.CUSTOM, message: `${field.label}: no Bobs` }
                : { rule: FieldRule.NONE, message: '' },
        );

        expect(validateVisibleFields(fields, { first_name: 'Bob', reference: '' }, check)).toEqual({
            first_name: { rule: FieldRule.CUSTOM, message: 'first_name: no Bobs' },
        });
        expect(check).toHaveBeenCalledTimes(1);
    });
});

describe('toggleSelection (DL#44 §2)', () => {
    const interests: FormFieldView = {
        ...multiselectField('interests'),
        options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
            { value: 'c', label: 'C' },
        ],
    };

    it('should add a checked option', () => {
        expect(
            toggleSelection(interests, { current: ['a'], optionValue: 'b', checked: true }),
        ).toEqual(['a', 'b']);
    });

    it('should remove an unchecked option', () => {
        expect(
            toggleSelection(interests, { current: ['a', 'b'], optionValue: 'a', checked: false }),
        ).toEqual(['b']);
    });

    it('should return the selection in option order, not click order', () => {
        expect(
            toggleSelection(interests, { current: ['c'], optionValue: 'a', checked: true }),
        ).toEqual(['a', 'c']);
    });

    it('should drop values that are not options of the field', () => {
        expect(
            toggleSelection(interests, {
                current: ['stale'],
                optionValue: 'unknown',
                checked: true,
            }),
        ).toEqual([]);
    });

    it.each(['', true, false])(
        'should start from an empty selection when current is %j',
        (current) => {
            expect(
                toggleSelection(interests, { current, optionValue: 'b', checked: true }),
            ).toEqual(['b']);
        },
    );

    it('should not duplicate an option that is checked twice', () => {
        expect(
            toggleSelection(interests, { current: ['a'], optionValue: 'a', checked: true }),
        ).toEqual(['a']);
    });
});

function telField(
    target: string,
    extra: { hidden?: boolean; phone?: PhoneRules } = {},
): FormFieldView {
    return { ...textField(target), inputType: 'tel', ...extra };
}

/**
 * Bug: the plugin posted phones as typed; Wix's caller path accepts only compact E.164.
 * Found in: design-log/55 - wix validation parity for wix-forms.md §1c "Sent value"
 * Expected: convertible tel values (visible or hidden) are sent as E.164; everything else unchanged.
 * Actual (before P1c): `toPostedValues` is missing.
 */
describe('toPostedValues (DL#55 P1c)', () => {
    const IL = { defaultCountry: 'IL' };

    it('should send a visible local phone as E.164 and leave other values alone', () => {
        const fields = [telField('phone', { phone: IL }), textField('name'), checkboxField('ok')];
        const values: Record<string, FieldValue> = {
            phone: '054.123.4567',
            name: ' Ann ',
            ok: true,
        };
        const before = structuredClone(values);
        expect(toPostedValues(fields, values)).toEqual({
            phone: '+972541234567',
            name: ' Ann ',
            ok: true,
        });
        expect(values).toEqual(before);
    });

    it('should trim a phone before converting it', () => {
        const fields = [telField('phone', { phone: IL })];
        expect(toPostedValues(fields, { phone: ' 054.123.4567' })).toEqual({
            phone: '+972541234567',
        });
    });

    it('should pass a hidden phone that cannot be converted through unchanged', () => {
        const fields = [telField('phone', { hidden: true })];
        expect(toPostedValues(fields, { phone: 'call me' })).toEqual({ phone: 'call me' });
    });

    it('should convert a hidden phone the page filled with an international number', () => {
        const fields = [telField('phone', { hidden: true })];
        expect(toPostedValues(fields, { phone: '00972541234567' })).toEqual({
            phone: '+972541234567',
        });
    });

    it('should keep an empty phone empty', () => {
        expect(toPostedValues([telField('phone', { phone: IL })], { phone: '' })).toEqual({
            phone: '',
        });
    });

    it('should judge a padded phone like the trimmed one in the browser and the payload', () => {
        const field = telField('phone');
        expect(checkFormField(field, ' +972541234567')).toEqual(
            checkFormField(field, '+972541234567'),
        );
        expect(toPostedValues([field], { phone: ' +972541234567' })).toEqual({
            phone: '+972541234567',
        });
    });
});
