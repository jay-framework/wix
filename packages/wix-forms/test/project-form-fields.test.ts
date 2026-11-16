// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    checkFormField,
    defaultFieldMessage,
    projectFormFields,
    projectFormSummaryFields,
    requiredUntargetedLabels,
    validateFormField,
    validateFormSummaryField,
} from '../lib/utils/project-form-fields.js';
import type { FieldValue, FormFieldView } from '../lib/types.js';
import { FieldRule } from '../lib/components/field-rule.js';
import type { RawForm } from '../lib/wix-apis/get-form.js';
import { fixtureField, formSummaryFixture, rawFormFixture } from './support/form-kinds.js';

const textView = { placeholder: '', options: [], hidden: false };

describe('projectFormFields (DL #51 §1)', () => {
    /**
     * DL #51 test 2 (projection): reads `formFields[]` only, in layout order, and returns the
     * unsupported fields instead of dropping or mis-rendering them.
     */
    it('should project booking-form.json in layout order, listing the address as unsupported', () => {
        expect(projectFormFields(rawFormFixture('booking-form'))).toEqual({
            fields: [
                {
                    target: 'first_name',
                    label: 'First name',
                    inputType: 'text',
                    required: true,
                    ...textView,
                },
                {
                    target: 'last_name',
                    label: 'Last name',
                    inputType: 'text',
                    required: true,
                    ...textView,
                },
                {
                    target: 'email',
                    label: 'Email',
                    inputType: 'email',
                    required: true,
                    ...textView,
                },
                { target: 'phone', label: 'Phone', inputType: 'tel', required: false, ...textView },
                {
                    target: 'add_your_message',
                    label: 'Add your message',
                    inputType: 'textarea',
                    required: false,
                    ...textView,
                },
            ],
            unsupportedFields: [
                {
                    target: 'address',
                    label: 'Multi-line address',
                    wixKind: 'ADDRESS/MULTILINE_ADDRESS',
                    required: true,
                },
            ],
        });
    });

    it('should project the contact form: chips, select and consent checkbox, all supported', () => {
        const projected = projectFormFields(rawFormFixture('contact-form'));
        expect(projected.unsupportedFields).toEqual([]);
        expect(
            projected.fields.map((field) => [field.target, field.inputType, field.required]),
        ).toEqual([
            ['first_name_5820', 'text', true],
            ['email_7e06', 'email', true],
            ['interests', 'multiselect', true],
            ['country', 'select', false],
            ['form_field_aa5f', 'checkbox', true],
        ]);
        expect(projected.fields[4]?.label).toBe('I agree to be contacted');
    });

    it('should list each unsupported kind of the all-kinds form with its Wix kind', () => {
        expect(
            projectFormFields(rawFormFixture('booking-form-all-kinds')).unsupportedFields,
        ).toEqual([
            {
                target: 'address',
                label: 'Multi-line address',
                wixKind: 'ADDRESS/MULTILINE_ADDRESS',
                required: true,
            },
            {
                target: 'file_upload_1ffc',
                label: 'File upload',
                wixKind: 'WIX_FILE/FILE_UPLOAD',
                required: false,
            },
        ]);
    });

    it('should ignore the old-style fields[] array and deletedFormFields', () => {
        const form = rawFormFixture('contact-form');
        const extra = fixtureField('booking-form-all-kinds', 'file_upload_1ffc');
        const withDeleted = { ...form, deletedFormFields: [extra] };
        expect(projectFormFields(withDeleted)).toEqual(projectFormFields(form));
        const oldStyleOnly = { fields: (form as { fields?: unknown }).fields } as RawForm;
        expect(projectFormFields(oldStyleOnly)).toEqual({
            fields: [],
            unsupportedFields: [],
        });
    });

    it('should skip layout items that are not in formFields and put unplaced fields last', () => {
        const form = rawFormFixture('booking-form');
        const items = form.steps![0]!.layout!.large!.items!;
        expect(items.map((item) => item.fieldId)).toContain('00000000-0000-0000-0000-000000000011');
        form.steps![0]!.layout!.large!.items = items.filter(
            (item) => item.fieldId !== '00000000-0000-0000-0000-000000000001',
        );
        expect(projectFormFields(form).fields.map((field) => field.target)).toEqual([
            'last_name',
            'email',
            'phone',
            'add_your_message',
            'first_name',
        ]);
    });

    /**
     * DL#41 4a: hidden fields are MARKED (hidden: true), not dropped, so a page can populate
     * them via the `control` channel and they reach the submission (DL #51 row 3).
     */
    it('should mark (not drop) hidden fields', () => {
        const form = rawFormFixture('contact-form');
        const email = form.formFields!.find(
            (field) => field.inputOptions?.target === 'email_7e06',
        )!;
        email.hidden = true;
        const projected = projectFormFields(form);
        expect(projected.fields.find((field) => field.target === 'email_7e06')).toMatchObject({
            inputType: 'email',
            hidden: true,
        });
    });

    it('should ignore display and untargeted fields', () => {
        const form = rawFormFixture('contact-form');
        delete form.formFields!.find((field) => field.inputOptions?.target === 'country')!
            .inputOptions!.target;
        const targets = projectFormFields(form).fields.map((field) => field.target);
        expect(targets).toEqual(['first_name_5820', 'email_7e06', 'interests', 'form_field_aa5f']);
    });
});

describe('requiredUntargetedLabels', () => {
    it('should name the required inputs that have no target', () => {
        const form = rawFormFixture('contact-form');
        delete form.formFields!.find((field) => field.inputOptions?.target === 'email_7e06')!
            .inputOptions!.target;
        delete form.formFields!.find((field) => field.inputOptions?.target === 'country')!
            .inputOptions!.target;
        expect(requiredUntargetedLabels(form)).toEqual(['Email']);
    });
});

describe('projectFormSummaryFields', () => {
    /**
     * DL #51 test 1. Bug: the summary filter silently dropped the required address.
     * Found in: QA 2026-11-10 (booking form bbb199c4, Problem 1).
     * Expected: the address is listed as unsupported, with `required: 'unknown'` (the Summary
     * API carries no `required`, Q13).
     */
    it('should list the Multi-line address of booking-form-summary.json as unsupported', () => {
        expect(projectFormSummaryFields(formSummaryFixture().formSummary?.fields)).toEqual({
            fields: [
                { target: 'first_name', label: 'First name', type: 'STRING', required: false },
                { target: 'last_name', label: 'Last name', type: 'STRING', required: false },
                { target: 'email', label: 'Email', type: 'EMAIL', required: false },
                { target: 'phone', label: 'Phone', type: 'PHONE', required: false },
                {
                    target: 'add_your_message',
                    label: 'Add your message',
                    type: 'STRING',
                    required: false,
                },
            ],
            unsupportedFields: [
                {
                    target: 'address',
                    label: 'Multi-line address',
                    wixKind: 'MULTILINE_ADDRESS',
                    required: 'unknown',
                },
            ],
        });
    });

    it('should drop deleted and untargeted summary fields', () => {
        expect(
            projectFormSummaryFields([
                { target: 'removed', label: 'Removed', type: 'STRING', deleted: true },
                { id: 'no-target', label: 'No target', type: 'STRING' },
                { target: 'photo', label: 'Photo', type: 'FILE' },
            ]),
        ).toEqual({
            fields: [],
            unsupportedFields: [
                { target: 'photo', label: 'Photo', wixKind: 'FILE', required: 'unknown' },
            ],
        });
    });

    it('should return empty lists when input has no fields', () => {
        expect(projectFormSummaryFields([])).toEqual({ fields: [], unsupportedFields: [] });
        expect(projectFormSummaryFields(undefined)).toEqual({ fields: [], unsupportedFields: [] });
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
    // Live capture (DL #51 Phase 0): one PHONE_INPUT field with no own default country.
    const form = rawFormFixture('booking-form');
    const phoneRulesByTarget = (options?: { defaultPhoneCountry?: string }) =>
        projectFormFields(form, options)
            .fields.filter((field) => 'phone' in field)
            .map((field) => [field.target, field.phone]);

    it('should give tel fields the default country', () => {
        expect(phoneRulesByTarget({ defaultPhoneCountry: 'IL' })).toEqual([
            ['phone', { defaultCountry: 'IL' }],
        ]);
    });

    it('should give no field phone rules without the option', () => {
        expect(phoneRulesByTarget()).toEqual([]);
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
        projectFormFields(form, options).fields.find((field) => field.target === 'phone')!;

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
