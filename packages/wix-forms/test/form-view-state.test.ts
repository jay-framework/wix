// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildFieldsViewState, buildFormViewState } from '../lib/components/form-view-state.js';
import { SubmitFailure, SubmitState } from '../lib/components/submit-outcome.js';
import { FieldRule } from '../lib/components/field-rule.js';
import type { FormFieldView } from '../lib/types.js';

const fields: FormFieldView[] = [
    {
        target: 'email',
        label: 'Email',
        inputType: 'email',
        required: true,
        placeholder: 'you@site.com',
        options: [],
    },
    {
        target: 'country',
        label: 'Country',
        inputType: 'select',
        required: false,
        placeholder: '',
        options: [{ value: 'us', label: 'United States' }],
    },
];

describe('buildFieldsViewState', () => {
    it('should key each field by its target with label/required/error/invalid, placeholder+value for inputs and options for selects', () => {
        expect(buildFieldsViewState(fields)).toEqual({
            email: {
                label: 'Email',
                required: true,
                error: '',
                invalid: false,
                errorRule: FieldRule.NONE,
                placeholder: 'you@site.com',
                value: '',
            },
            country: {
                label: 'Country',
                required: false,
                error: '',
                invalid: false,
                errorRule: FieldRule.NONE,
                options: [{ value: 'us', label: 'United States' }],
            },
        });
    });

    it('should map submission errors into the matching field error slot by target', () => {
        const result = buildFieldsViewState(fields, { email: 'Invalid email address' });
        expect(result.email.error).toEqual('Invalid email address');
        expect(result.country.error).toEqual('');
    });

    it('should reflect the per-field invalid flag and value echo by target', () => {
        const result = buildFieldsViewState(
            fields,
            { email: 'Invalid email address' },
            { email: true },
            { email: 'ada@example.com' },
        );
        expect(result.email.invalid).toBe(true);
        expect(result.email.value).toEqual('ada@example.com');
        expect(result.country.invalid).toBe(false);
    });
});

describe('buildFormViewState errorRule (DL#53 G1)', () => {
    const base = { isSubmitting: false, statusMessage: '', loadError: '' };

    it('should default every field errorRule to NONE', () => {
        const result = buildFormViewState(fields, base) as Record<string, any>;
        expect(result.email.errorRule).toBe(FieldRule.NONE);
        expect(result.country.errorRule).toBe(FieldRule.NONE);
    });

    it('should set errorRule by target from ruleByTarget', () => {
        const result = buildFormViewState(fields, {
            ...base,
            ruleByTarget: { email: FieldRule.EMAIL },
        }) as Record<string, any>;
        expect(result.email.errorRule).toBe(FieldRule.EMAIL);
        expect(result.country.errorRule).toBe(FieldRule.NONE);
    });
});

describe('buildFormViewState', () => {
    it('should add the reserved form-level tags alongside the per-field slots', () => {
        const result = buildFormViewState(fields, {
            isSubmitting: true,
            isHandedOff: true, // DL #57 G6: SUBMITTING means handed to the server
            statusMessage: 'Form submitted successfully.',
            loadError: '',
        });
        expect(result).toEqual({
            email: {
                label: 'Email',
                required: true,
                error: '',
                invalid: false,
                errorRule: FieldRule.NONE,
                placeholder: 'you@site.com',
                value: '',
            },
            country: {
                label: 'Country',
                required: false,
                error: '',
                invalid: false,
                errorRule: FieldRule.NONE,
                options: [{ value: 'us', label: 'United States' }],
            },
            isLoading: false,
            loadError: '',
            isSubmitting: true,
            statusMessage: 'Form submitted successfully.',
            isSubmitted: false,
            submitState: SubmitState.SUBMITTING,
            submitFailure: SubmitFailure.NONE,
        });
    });

    it('should report isLoading when there are no fields and no load error', () => {
        const result = buildFormViewState([], {
            isSubmitting: false,
            statusMessage: '',
            loadError: '',
        });
        expect(result.isLoading).toBe(true);
    });

    it('should not report isLoading when loading failed', () => {
        const result = buildFormViewState([], {
            isSubmitting: false,
            statusMessage: '',
            loadError: 'Could not load the form.',
        });
        expect(result.isLoading).toBe(false);
        expect(result.loadError).toEqual('Could not load the form.');
    });
});

describe('buildFormViewState submit outcome (DL#45)', () => {
    const idle = { isSubmitting: false, statusMessage: '', loadError: '' };

    it('should be IDLE with no failure by default', () => {
        const result = buildFormViewState(fields, idle);
        expect(result.submitState).toEqual(SubmitState.IDLE);
        expect(result.submitFailure).toEqual(SubmitFailure.NONE);
    });

    it('should be SUBMITTING while a handed-off submit is in flight', () => {
        const result = buildFormViewState(fields, {
            ...idle,
            isSubmitting: true,
            isHandedOff: true,
        });
        expect(result.submitState).toEqual(SubmitState.SUBMITTING);
    });

    /**
     * Bug: "Sending…" flashes on a client-validation stop (DL #57 G6, Q13).
     * Expected: busy before hand-off is IDLE. Actual: SUBMITTING from the first click.
     */
    it('should be IDLE while busy before the hand-off', () => {
        const result = buildFormViewState(fields, { ...idle, isSubmitting: true });
        expect(result.submitState).toEqual(SubmitState.IDLE);
    });

    it('should be SUCCEEDED once submitted, even while a redirect keeps isSubmitting set', () => {
        const result = buildFormViewState(fields, {
            ...idle,
            isSubmitting: true,
            isSubmitted: true,
        });
        expect(result.submitState).toEqual(SubmitState.SUCCEEDED);
    });

    it('should be FAILED with the failure reason, independent of statusMessage', () => {
        const result = buildFormViewState(fields, {
            ...idle,
            submitFailure: SubmitFailure.NETWORK,
        });
        expect(result.submitState).toEqual(SubmitState.FAILED);
        expect(result.submitFailure).toEqual(SubmitFailure.NETWORK);
        expect(result.statusMessage).toEqual('');
    });
});
