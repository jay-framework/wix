// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    buildFieldsViewState,
    buildFormViewState,
} from '../lib/components/form-view-state.js';
import type { FormFieldView } from '../lib/types.js';

const fields: FormFieldView[] = [
    { target: 'email', label: 'Email', inputType: 'email', required: true, placeholder: 'you@site.com', options: [] },
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
    it('should key each field by its target with label/required/error, placeholder for inputs and options for selects', () => {
        expect(buildFieldsViewState(fields)).toEqual({
            email: {
                label: 'Email',
                required: true,
                error: '',
                placeholder: 'you@site.com',
            },
            country: {
                label: 'Country',
                required: false,
                error: '',
                options: [{ value: 'us', label: 'United States' }],
            },
        });
    });

    it('should map submission errors into the matching field error slot by target', () => {
        const result = buildFieldsViewState(fields, { email: 'Invalid email address' });
        expect(result.email.error).toEqual('Invalid email address');
        expect(result.country.error).toEqual('');
    });
});

describe('buildFormViewState', () => {
    it('should add the reserved form-level tags alongside the per-field slots', () => {
        const result = buildFormViewState(fields, {
            isSubmitting: true,
            statusMessage: 'Form submitted successfully.',
            loadError: '',
        });
        expect(result).toEqual({
            email: { label: 'Email', required: true, error: '', placeholder: 'you@site.com' },
            country: {
                label: 'Country',
                required: false,
                error: '',
                options: [{ value: 'us', label: 'United States' }],
            },
            isLoading: false,
            loadError: '',
            isSubmitting: true,
            statusMessage: 'Form submitted successfully.',
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
