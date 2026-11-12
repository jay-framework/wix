// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    checkFormField,
    defaultFieldMessage,
    projectFormFields,
    projectFormSummaryFields,
    validateFormField,
    validateFormSummaryField,
} from '../lib/utils/project-form-fields.js';
import type { FieldValue, FormFieldView } from '../lib/types.js';
import { FieldRule } from '../lib/components/field-rule.js';

describe('projectFormFields', () => {
    /**
     * Bug: DL#40 dropped hidden fields entirely (`!field.hidden`), so a page could
     *   not populate a Wix hidden field and it never reached the submission.
     * Found in: design-log/39 - general forms infrastructure.md §Design 4a (narrows DL#40 OQ-4)
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
     * Bug (DL#41 4c, test 3 — runtime, failing-first): the submit path is
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

describe('checkFormField (DL#53 G1)', () => {
    function fieldOf(overrides: Partial<FormFieldView>): FormFieldView {
        return {
            target: 'f',
            label: 'Field',
            inputType: 'text',
            required: false,
            placeholder: '',
            options: [],
            ...overrides,
        };
    }

    const cases: Array<[string, Partial<FormFieldView>, FieldValue, FieldRule, string]> = [
        ['a valid value', { required: true }, 'ok', FieldRule.NONE, ''],
        ['an empty optional value', {}, '', FieldRule.NONE, ''],
        [
            'an empty required value',
            { required: true },
            '  ',
            FieldRule.REQUIRED,
            'Field is required.',
        ],
        [
            'an unchecked required checkbox',
            { inputType: 'checkbox', required: true },
            false,
            FieldRule.REQUIRED,
            'Field is required.',
        ],
        [
            'an empty required multiselect',
            { inputType: 'multiselect', required: true },
            [],
            FieldRule.REQUIRED,
            'Field is required.',
        ],
        [
            'a too-short value',
            { minLength: 3 },
            'ab',
            FieldRule.MIN_LENGTH,
            'Field must be at least 3 characters.',
        ],
        [
            'a too-long value',
            { maxLength: 2 },
            'abc',
            FieldRule.MAX_LENGTH,
            'Field must be at most 2 characters.',
        ],
        [
            'a malformed email',
            { inputType: 'email' },
            'x@y',
            FieldRule.EMAIL,
            'Please enter a valid email address.',
        ],
        [
            'a malformed phone',
            { inputType: 'tel' },
            'abc',
            FieldRule.PHONE,
            'Please enter a valid phone number.',
        ],
        [
            'a malformed url',
            { inputType: 'url' },
            'site.com',
            FieldRule.URL,
            'Please enter a valid URL.',
        ],
        [
            'a pattern mismatch',
            { pattern: '^[0-9]+$' },
            'abc',
            FieldRule.PATTERN,
            'Field is not in the expected format.',
        ],
        ['an invalid pattern regex', { pattern: '(' }, 'abc', FieldRule.NONE, ''],
        // DL#55 P1c: red before P1c (a local phone with no country passed as NONE).
        [
            'a local phone with no country',
            { inputType: 'tel' },
            '0541234567',
            FieldRule.PHONE_COUNTRY,
            'Please include the country code, starting with +.',
        ],
        [
            'a phone from a country the field does not accept',
            { inputType: 'tel', phone: { allowedCountries: ['IL', 'US', 'CA'] } },
            '+442079460958',
            FieldRule.PHONE_COUNTRY,
            'Please enter a number with one of these country codes: +972, +1.',
        ],
    ];

    it.each(cases)('should report %s', (_name, overrides, value, rule, message) => {
        expect(checkFormField(fieldOf(overrides), value)).toEqual({ rule, message });
    });

    /** DL#55 P2: one source for the default text, shared by the browser and classified server errors. */
    it.each(cases.filter(([, , , rule]) => rule !== FieldRule.NONE))(
        'should give the default message of %s',
        (_name, overrides, _value, rule, message) => {
            expect(defaultFieldMessage(rule, fieldOf(overrides))).toBe(message);
        },
    );

    it.each([
        ['MIN_LENGTH without a bound', FieldRule.MIN_LENGTH],
        ['MAX_LENGTH without a bound', FieldRule.MAX_LENGTH],
        ['NONE', FieldRule.NONE],
        ['CUSTOM', FieldRule.CUSTOM],
        ['SERVER', FieldRule.SERVER],
    ])('should have no default message for %s', (_name, rule) => {
        expect(defaultFieldMessage(rule, fieldOf({}))).toBeUndefined();
    });
});

/**
 * Bug: a site's default phone country never reached the browser check (DL#55 P1c, Q30).
 * Found in: design-log/55 - wix validation parity for wix-forms.md §1c "Config (P1c-a)"
 * Expected: tel fields carry `phone: { defaultCountry }` from the option; no other field has `phone`.
 */
describe('projectFormFields with defaultPhoneCountry (DL#55 P1c)', () => {
    const form = {
        fields: [
            { target: 'name', view: { label: 'Name' } },
            {
                target: 'email',
                view: { label: 'Email' },
                validation: { string: { format: 'EMAIL' } },
            },
            {
                target: 'phone',
                view: { label: 'Phone' },
                validation: { string: { format: 'PHONE' } },
            },
            { target: 'site', view: { label: 'Site' }, validation: { string: { format: 'URL' } } },
        ],
    };

    it('should give tel fields the default country', () => {
        const fields = projectFormFields(form, { defaultPhoneCountry: 'IL' });
        expect(fields.map((field) => [field.target, field.phone])).toEqual([
            ['name', undefined],
            ['email', undefined],
            ['phone', { defaultCountry: 'IL' }],
            ['site', undefined],
        ]);
        expect(fields.filter((field) => 'phone' in field).map((field) => field.target)).toEqual([
            'phone',
        ]);
    });

    it('should give no field phone rules without the option', () => {
        expect(projectFormFields(form).some((field) => 'phone' in field)).toBe(false);
    });
});

/**
 * Bug: the plugin ignored a real Wix Phone field's Default country and Accepted countries.
 * Found in: design-log/55 - wix validation parity for wix-forms.md §1c "Phone field options (P1c-b)"
 * Expected: from the L7 capture (a CONTACTS_PHONE field, default IL, accepted IL + US), the tel
 *   field carries those rules, and the field's default wins over `defaultPhoneCountry`.
 */
describe('projectFormFields on a real Wix Phone field (DL#55 P1c-b, L7 capture)', () => {
    const { form } = JSON.parse(
        readFileSync(
            resolve(__dirname, 'fixtures/format-parity/phone-input-field-schema.json'),
            'utf8',
        ),
    );
    const phoneOf = (options?: { defaultPhoneCountry?: string }) =>
        projectFormFields(form, options).find((field) => field.target === 'phone')!;

    it('should project the field as tel with its default and accepted countries', () => {
        expect(phoneOf()).toMatchObject({
            inputType: 'tel',
            phone: { defaultCountry: 'IL', allowedCountries: ['IL', 'US'] },
        });
    });

    it("should let the field's default country win over defaultPhoneCountry", () => {
        expect(phoneOf({ defaultPhoneCountry: 'GB' }).phone).toEqual({
            defaultCountry: 'IL',
            allowedCountries: ['IL', 'US'],
        });
    });

    it.each([
        ['0541234567', FieldRule.NONE, ''],
        ['+12025550123', FieldRule.NONE, ''],
        [
            '+442079460958',
            FieldRule.PHONE_COUNTRY,
            'Please enter a number with one of these country codes: +972, +1.',
        ],
    ])('should judge "%s" by the field\'s countries', (value, rule, message) => {
        expect(checkFormField(phoneOf(), value)).toEqual({ rule, message });
    });
});
