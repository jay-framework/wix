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
    /**
     * Bug: DL#38 dropped hidden fields entirely (`!field.hidden`), so a page could
     *   not populate a Wix hidden field and it never reached the submission.
     * Found in: design-log/39 - general forms infrastructure.md §Design 4a (narrows DL#38 OQ-4)
     * Expected: hidden fields are MARKED (hidden: true), not dropped, so the generator
     *   can emit their value+control channel and the component submits them.
     */
    it('should project raw form fields, marking (not dropping) hidden fields', () => {
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
                    target: 'propertyId',
                    hidden: true,
                    view: { label: 'Property' },
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
                hidden: false,
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
                hidden: false,
            },
            {
                target: 'propertyId',
                label: 'Property',
                inputType: 'text',
                required: false,
                placeholder: '',
                minLength: undefined,
                maxLength: undefined,
                pattern: undefined,
                options: [],
                hidden: true,
            },
        ]);
    });

    /**
     * Bug (DL#39 4c, test 3 — runtime, failing-first): the submit path is
     *   Record<string,string> and the projection has no checkbox/multiselect kind,
     *   so a boolean checkbox submits its static `value` attribute and a multi-select
     *   is truncated to a single string.
     * Found in: design-log/39 - general forms infrastructure.md §Design 4c.
     * Expected: readInputType (via projectFormFields) returns 'checkbox' for a single
     *   boolean field and 'multiselect' for a multiple-selection choice.
     * Actual (pre-fix): FormFieldInputType has neither kind and readInputType returns
     *   'text' / 'select' — this test fails red at runtime until 4c lands.
     */
    it('should detect a single boolean field as a checkbox', () => {
        const result = projectFormFields({
            fields: [
                {
                    target: 'consent',
                    view: { label: 'I agree', fieldType: 'CHECKBOX' },
                    validation: { required: true, boolean: {} },
                },
            ],
        });
        expect(result[0]?.inputType).toBe('checkbox');
    });

    it('should detect a multiple-selection choice as a multiselect', () => {
        const result = projectFormFields({
            fields: [
                {
                    target: 'interests',
                    view: {
                        label: 'Interests',
                        fieldType: 'CHECKBOX_GROUP',
                        options: [
                            { value: 'news', label: 'News' },
                            { value: 'offers', label: 'Offers' },
                        ],
                    },
                },
            ],
        });
        expect(result[0]?.inputType).toBe('multiselect');
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
