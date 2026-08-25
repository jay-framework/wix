// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    parseSubmissionFieldErrors,
    projectFormFields,
    projectFormSummaryFields,
    validateFormField,
    validateFormSummaryField,
} from '../lib/utils/project-form-fields.js';
import type { FormFieldView } from '../lib/types.js';

describe('projectFormFields', () => {
    it('should project raw form fields into form field views', () => {
        const result = projectFormFields({
            fields: [
                {
                    target: 'email',
                    hidden: false,
                    view: { label: 'Email', fieldType: 'TEXT_INPUT' },
                    validation: { required: true, string: { format: 'EMAIL' } },
                },
                {
                    target: 'message',
                    hidden: false,
                    view: { label: 'Message', fieldType: 'TEXT_AREA' },
                },
                {
                    target: 'hidden_field',
                    hidden: true,
                    view: { label: 'Hidden' },
                },
            ],
        });

        expect(result).toEqual([
            {
                target: 'email',
                label: 'Email',
                inputType: 'email',
                required: true,
                placeholder: '',
                minLength: undefined,
                maxLength: undefined,
                pattern: undefined,
                options: [],
            },
            {
                target: 'message',
                label: 'Message',
                inputType: 'textarea',
                required: false,
                placeholder: '',
                minLength: undefined,
                maxLength: undefined,
                pattern: undefined,
                options: [],
            },
        ]);
    });

    it('should map select fields from options', () => {
        const result = projectFormFields({
            fields: [
                {
                    target: 'topic',
                    view: {
                        label: 'Topic',
                        options: [
                            { value: 'sales', label: 'Sales' },
                            { value: 'support', label: 'Support' },
                        ],
                    },
                },
            ],
        });

        expect(result[0]?.inputType).toBe('select');
        expect(result[0]?.options).toEqual([
            { value: 'sales', label: 'Sales' },
            { value: 'support', label: 'Support' },
        ]);
    });
});

describe('projectFormSummaryFields', () => {
    it('should project summary fields and filter deleted or unsupported types', () => {
        const result = projectFormSummaryFields([
            { target: 'first_name', label: 'First Name', type: 'STRING', required: true },
            { target: 'removed', label: 'Removed', type: 'STRING', deleted: true },
            { target: 'photo', label: 'Photo', type: 'FILE' },
        ]);

        expect(result).toEqual([
            {
                target: 'first_name',
                label: 'First Name',
                type: 'STRING',
                required: true,
            },
        ]);
    });

    it('should return an empty array when input has no usable fields', () => {
        expect(projectFormSummaryFields([])).toEqual([]);
        expect(projectFormSummaryFields(undefined)).toEqual([]);
    });
});

describe('validateFormSummaryField', () => {
    it('should require non-empty values for required summary fields', () => {
        expect(
            validateFormSummaryField(
                {
                    target: 'first_name',
                    label: 'First Name',
                    type: 'STRING',
                    required: true,
                },
                '',
            ),
        ).toBe('First Name is required.');
    });

    it('should validate email summary fields', () => {
        expect(
            validateFormSummaryField(
                {
                    target: 'email',
                    label: 'Email',
                    type: 'EMAIL',
                    required: true,
                },
                'not-an-email',
            ),
        ).toBe('Please enter a valid email address.');
        expect(
            validateFormSummaryField(
                {
                    target: 'email',
                    label: 'Email',
                    type: 'EMAIL',
                    required: true,
                },
                'user@example.com',
            ),
        ).toBe('');
    });
});

describe('validateFormField', () => {
    const emailField: FormFieldView = {
        target: 'email',
        label: 'Email',
        inputType: 'email',
        required: true,
        placeholder: '',
        options: [],
    };

    it('should require non-empty values for required fields', () => {
        expect(validateFormField(emailField, '')).toBe('Email is required.');
    });

    it('should validate email format', () => {
        expect(validateFormField(emailField, 'not-an-email')).toBe(
            'Please enter a valid email address.',
        );
        expect(validateFormField(emailField, 'user@example.com')).toBe('');
    });
});

describe('parseSubmissionFieldErrors', () => {
    it('should parse Wix validation error response into field errors', () => {
        const body = JSON.stringify({
            details: {
                validationError: {
                    fieldViolations: [
                        {
                            data: {
                                errors: [
                                    {
                                        errorPath: 'email',
                                        errorMessage: 'Invalid email address',
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
        });

        expect(parseSubmissionFieldErrors(body)).toEqual({
            email: 'Invalid email address',
        });
    });

    it('should return empty object for invalid JSON', () => {
        expect(parseSubmissionFieldErrors('not json')).toEqual({});
    });
});
