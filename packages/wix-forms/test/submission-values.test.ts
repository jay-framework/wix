// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    emptyStoreFor,
    projectSubmissionValues,
    seedControlValues,
    type ControlSeed,
} from '../lib/components/submission-values.js';
import type { FormFieldView } from '../lib/types.js';

function textField(target: string): FormFieldView {
    return { target, label: target, inputType: 'text', required: false, placeholder: '', options: [] };
}

function checkboxField(target: string): FormFieldView {
    return { target, label: target, inputType: 'checkbox', required: false, placeholder: '', options: [] };
}

function multiselectField(target: string): FormFieldView {
    return { target, label: target, inputType: 'multiselect', required: false, placeholder: '', options: [] };
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
     * Bug (DL#39 4c, test 1 — TYPE-LEVEL check, not a vitest-runtime reproduction):
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
     * Bug (DL#39 4c, test 2 — TYPE-LEVEL check, not a vitest-runtime reproduction):
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
     * Bug (DL#39 Capability 1 reset — browser QA): after a successful submit, clicking the
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
        const fields = [textField('email'), checkboxField('consent'), multiselectField('interests')];
        expect(emptyStoreFor(fields)).toEqual({ email: '', consent: false, interests: [] });
    });

    it('should return an empty store for a form with no fields', () => {
        expect(emptyStoreFor([])).toEqual({});
    });
});

describe('seedControlValues', () => {
    /**
     * Bug (DL#39 Phase-9 browser QA): a hidden control-channel field
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
        expect(seedControlValues({}, seeds)).toEqual({ propertyId: 'prop-123' });
    });

    it('should not overwrite a field the user already edited', () => {
        const seeds: ControlSeed[] = [{ target: 'email', value: 'default@x.com', dirty: true }];
        expect(seedControlValues({ email: 'typed@x.com' }, seeds)).toEqual({
            email: 'typed@x.com',
        });
    });

    it('should ignore an empty control value', () => {
        const seeds: ControlSeed[] = [{ target: 'propertyId', value: '', dirty: false }];
        expect(seedControlValues({}, seeds)).toEqual({});
    });

    it('should leave existing store values untouched', () => {
        const seeds: ControlSeed[] = [{ target: 'propertyId', value: 'prop-123', dirty: false }];
        expect(seedControlValues({ email: 'ada@x.com' }, seeds)).toEqual({
            email: 'ada@x.com',
            propertyId: 'prop-123',
        });
    });
});
