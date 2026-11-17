// @vitest-environment node

/**
 * DL #51 test 2: the classification key and table, against the live Get Form captures (F5) and
 * one hand-written field per remaining row. Expected values come from F5 and the log's
 * classification table, never from current output.
 */

import { describe, expect, it } from 'vitest';
import {
    classifyFormField,
    ignoreReasonOf,
    readFieldKey,
    wixKindOf,
    type FieldKey,
} from '../lib/utils/classify-form-field.js';
import { readFieldView } from '../lib/utils/read-field-view.js';
import type { RawFormField } from '../lib/wix-apis/get-form.js';
import { fixtureField, rawFormFixture, type GetFormFixture } from './support/form-kinds.js';

type Tuple = Pick<FieldKey, 'inputType' | 'componentType' | 'format' | 'required'>;

/** F5, per fixture field: [fixture, target or identifier, the observed tuple]. */
const F5_TUPLES: Array<[GetFormFixture, string, Tuple]> = [
    [
        'booking-form-all-kinds',
        'first_name',
        {
            inputType: 'STRING',
            componentType: 'TEXT_INPUT',
            format: 'UNKNOWN_FORMAT',
            required: true,
        },
    ],
    [
        'booking-form-all-kinds',
        'last_name',
        {
            inputType: 'STRING',
            componentType: 'TEXT_INPUT',
            format: 'UNKNOWN_FORMAT',
            required: true,
        },
    ],
    [
        'booking-form-all-kinds',
        'email',
        { inputType: 'STRING', componentType: 'TEXT_INPUT', format: 'EMAIL', required: true },
    ],
    [
        'booking-form-all-kinds',
        'phone',
        { inputType: 'STRING', componentType: 'PHONE_INPUT', format: 'PHONE', required: false },
    ],
    [
        'booking-form-all-kinds',
        'add_your_message',
        {
            inputType: 'STRING',
            componentType: 'TEXT_INPUT',
            format: 'UNKNOWN_FORMAT',
            required: false,
        },
    ],
    [
        'booking-form-all-kinds',
        'address',
        {
            inputType: 'ADDRESS',
            componentType: 'MULTILINE_ADDRESS',
            format: 'UNKNOWN_FORMAT',
            required: true,
        },
    ],
    [
        'booking-form-all-kinds',
        'form_field_e966',
        {
            inputType: 'BOOLEAN',
            componentType: 'CHECKBOX',
            format: 'UNKNOWN_FORMAT',
            required: false,
        },
    ],
    [
        'booking-form-all-kinds',
        'dropdown_7b7d',
        {
            inputType: 'STRING',
            componentType: 'DROPDOWN',
            format: 'UNKNOWN_FORMAT',
            required: false,
        },
    ],
    [
        'booking-form-all-kinds',
        'date_picker_99d5',
        { inputType: 'STRING', componentType: 'DATE_PICKER', format: 'DATE', required: false },
    ],
    [
        'booking-form-all-kinds',
        'multi_choice_acf9',
        {
            inputType: 'ARRAY',
            componentType: 'CHECKBOX_GROUP',
            format: 'UNKNOWN_FORMAT',
            required: false,
        },
    ],
    [
        'booking-form-all-kinds',
        'long_answer_1135',
        {
            inputType: 'STRING',
            componentType: 'TEXT_INPUT',
            format: 'UNKNOWN_FORMAT',
            required: false,
        },
    ],
    [
        'booking-form-all-kinds',
        'file_upload_1ffc',
        {
            inputType: 'WIX_FILE',
            componentType: 'FILE_UPLOAD',
            format: 'UNKNOWN_FORMAT',
            required: false,
        },
    ],
    [
        'contact-form',
        'first_name_5820',
        {
            inputType: 'STRING',
            componentType: 'TEXT_INPUT',
            format: 'UNKNOWN_FORMAT',
            required: true,
        },
    ],
    [
        'contact-form',
        'email_7e06',
        { inputType: 'STRING', componentType: 'TEXT_INPUT', format: 'EMAIL', required: true },
    ],
    [
        'contact-form',
        'interests',
        {
            inputType: 'ARRAY',
            componentType: 'CHECKBOX_GROUP',
            format: 'UNKNOWN_FORMAT',
            required: true,
        },
    ],
    [
        'contact-form',
        'country',
        {
            inputType: 'STRING',
            componentType: 'DROPDOWN',
            format: 'UNKNOWN_FORMAT',
            required: false,
        },
    ],
    [
        'contact-form',
        'form_field_aa5f',
        {
            inputType: 'BOOLEAN',
            componentType: 'CHECKBOX',
            format: 'UNKNOWN_FORMAT',
            required: true,
        },
    ],
    [
        'booking-form',
        'address',
        {
            inputType: 'ADDRESS',
            componentType: 'MULTILINE_ADDRESS',
            format: 'UNKNOWN_FORMAT',
            required: true,
        },
    ],
    [
        'default-form',
        'address',
        {
            inputType: 'ADDRESS',
            componentType: 'MULTILINE_ADDRESS',
            format: 'UNKNOWN_FORMAT',
            required: true,
        },
    ],
    [
        'default-form',
        'first_name',
        {
            inputType: 'STRING',
            componentType: 'TEXT_INPUT',
            format: 'UNKNOWN_FORMAT',
            required: true,
        },
    ],
];

/** The log's fixture table, per-form 1a column: undefined = unsupported. */
const PER_FORM_KIND: Array<[GetFormFixture, string, ReturnType<typeof classifyFormField>]> = [
    ['booking-form-all-kinds', 'first_name', 'text'],
    ['booking-form-all-kinds', 'last_name', 'text'],
    ['booking-form-all-kinds', 'phone', 'tel'],
    ['booking-form-all-kinds', 'email', 'email'],
    // DL #52 flips row 13: the address is supported (its spec is resolved by the projection).
    ['booking-form-all-kinds', 'address', 'address'],
    ['booking-form-all-kinds', 'add_your_message', 'textarea'],
    ['booking-form-all-kinds', 'long_answer_1135', 'textarea'],
    ['booking-form-all-kinds', 'form_field_e966', 'checkbox'],
    ['booking-form-all-kinds', 'dropdown_7b7d', 'select'],
    ['booking-form-all-kinds', 'date_picker_99d5', 'text'],
    ['booking-form-all-kinds', 'multi_choice_acf9', 'multiselect'],
    ['booking-form-all-kinds', 'file_upload_1ffc', undefined],
    ['contact-form', 'first_name_5820', 'text'],
    ['contact-form', 'email_7e06', 'email'],
    ['contact-form', 'interests', 'multiselect'],
    ['contact-form', 'country', 'select'],
    ['contact-form', 'form_field_aa5f', 'checkbox'],
];

function textField(overrides: {
    inputOptions?: Partial<NonNullable<RawFormField['inputOptions']>>;
    field?: Partial<RawFormField>;
    format?: string;
    componentType?: string;
    enumValues?: string[];
}): RawFormField {
    return {
        id: 'hand-written',
        fieldType: 'INPUT',
        identifier: 'TEXT_INPUT',
        hidden: false,
        ...overrides.field,
        inputOptions: {
            target: 'hand_written',
            required: false,
            inputType: 'STRING',
            stringOptions: {
                componentType: overrides.componentType ?? 'TEXT_INPUT',
                validation: {
                    format: overrides.format ?? 'UNKNOWN_FORMAT',
                    enum: overrides.enumValues ?? [],
                },
                textInputOptions: { label: 'Hand written' },
            },
            ...overrides.inputOptions,
        },
    };
}

function choiceField(
    componentType: 'DROPDOWN' | 'RADIO_GROUP',
    enumValues: string[],
    componentOptions: Record<string, unknown> = {},
): RawFormField {
    const optionsKey = componentType === 'DROPDOWN' ? 'dropdownOptions' : 'radioGroupOptions';
    return {
        id: 'hand-written-choice',
        fieldType: 'INPUT',
        identifier: componentType,
        hidden: false,
        inputOptions: {
            target: 'choice',
            required: false,
            inputType: 'STRING',
            stringOptions: {
                componentType,
                validation: { format: 'UNKNOWN_FORMAT', enum: enumValues },
                [optionsKey]: {
                    label: 'Choice',
                    options: enumValues.map((value) => ({ value, label: value })),
                    ...componentOptions,
                },
            },
        },
    };
}

function kindOf(raw: RawFormField) {
    return classifyFormField(readFieldKey(raw));
}

describe('readFieldKey (DL #51 F5 tuples)', () => {
    it.each(F5_TUPLES)('%s %s → the observed tuple', (fixture, target, tuple) => {
        expect(readFieldKey(fixtureField(fixture, target))).toMatchObject(tuple);
    });

    it('reads every formFields entry of the four Get Form fixtures with a format', () => {
        const fixtures: GetFormFixture[] = [
            'booking-form',
            'default-form',
            'contact-form',
            'booking-form-all-kinds',
        ];
        for (const fixture of fixtures) {
            for (const raw of rawFormFixture(fixture).formFields ?? []) {
                expect(readFieldKey(raw).format).toMatch(/^[A-Z_]+$/);
            }
        }
    });

    it('reads the identifier, target, enum and item type of the live fields', () => {
        expect(
            readFieldKey(fixtureField('booking-form-all-kinds', 'add_your_message')),
        ).toMatchObject({
            identifier: 'TEXT_AREA',
            target: 'add_your_message',
            hidden: false,
            readOnly: false,
            customOption: false,
            fieldType: 'INPUT',
        });
        expect(
            readFieldKey(fixtureField('booking-form-all-kinds', 'dropdown_7b7d')).enumValues,
        ).toEqual(['Option 1', 'Option 2']);
        expect(readFieldKey(fixtureField('contact-form', 'interests'))).toMatchObject({
            itemType: 'STRING',
            enumValues: ['News', 'Offers', 'Events'],
        });
    });

    it('ignores the boolean enum of a checkbox (row 11)', () => {
        expect(readFieldKey(fixtureField('contact-form', 'form_field_aa5f')).enumValues).toEqual(
            [],
        );
    });

    it('reads a rich-content label as its plain text', () => {
        expect(readFieldKey(fixtureField('contact-form', 'form_field_aa5f')).label).toBe(
            'I agree to be contacted',
        );
    });

    it('reads labels from <component>Options', () => {
        expect(readFieldKey(fixtureField('booking-form-all-kinds', 'phone')).label).toBe('Phone');
        expect(readFieldKey(fixtureField('booking-form-all-kinds', 'address')).label).toBe(
            'Multi-line address',
        );
        expect(readFieldKey(fixtureField('booking-form-all-kinds', 'file_upload_1ffc')).label).toBe(
            'File upload',
        );
        expect(readFieldKey(fixtureField('booking-form-all-kinds', 'date_picker_99d5')).label).toBe(
            'Date picker',
        );
    });

    it('falls back to the target, then the id, for a missing label', () => {
        const unlabelled = textField({});
        delete (unlabelled.inputOptions!.stringOptions as Record<string, unknown>).textInputOptions;
        expect(readFieldKey(unlabelled).label).toBe('hand_written');
        delete unlabelled.inputOptions!.target;
        expect(readFieldKey(unlabelled).label).toBe('hand-written');
    });

    it('reads a DISPLAY field that has displayOptions and no inputOptions', () => {
        const header = fixtureField('booking-form-all-kinds', 'BOOKINGS_HEADER');
        expect(readFieldKey(header).fieldType).toBe('DISPLAY');
        expect(ignoreReasonOf(readFieldKey(header))).toBe('display');
    });

    it('reads an unknown fieldType as INPUT, which lands in row 14', () => {
        const key = readFieldKey(textField({ field: { fieldType: 'FOO' as 'INPUT' } }));
        expect(key.fieldType).toBe('INPUT');
        const noInputOptions = readFieldKey({ id: 'x', fieldType: 'FOO' as 'INPUT' });
        expect(noInputOptions.fieldType).toBe('INPUT');
        expect(classifyFormField(noInputOptions)).toBeUndefined();
    });
});

describe('wixKindOf', () => {
    it('names the Wix kind, omitting UNKNOWN_FORMAT', () => {
        expect(wixKindOf(readFieldKey(fixtureField('booking-form-all-kinds', 'address')))).toBe(
            'ADDRESS/MULTILINE_ADDRESS',
        );
        expect(wixKindOf(readFieldKey(fixtureField('booking-form-all-kinds', 'email')))).toBe(
            'STRING/TEXT_INPUT/EMAIL',
        );
    });

    it('reads a missing part as "?"', () => {
        expect(wixKindOf(readFieldKey({ id: 'x', fieldType: 'INPUT', inputOptions: {} }))).toBe(
            '?/?',
        );
    });
});

describe('ignoreReasonOf (rows 1-2)', () => {
    it('ignores display fields', () => {
        const submit = fixtureField('contact-form', 'SUBMIT_BUTTON');
        expect(ignoreReasonOf(readFieldKey(submit))).toBe('display');
    });

    it('ignores an untargeted input, required or not', () => {
        const untargeted = textField({ inputOptions: { target: undefined, required: true } });
        const key = readFieldKey(untargeted);
        expect(key.required).toBe(true);
        expect(ignoreReasonOf(key)).toBe('no-target');
    });

    it('does not ignore a targeted input', () => {
        expect(
            ignoreReasonOf(readFieldKey(fixtureField('contact-form', 'email_7e06'))),
        ).toBeUndefined();
    });
});

describe('classifyFormField (rows 3-14, per-form column)', () => {
    it.each(PER_FORM_KIND)('%s %s → %s', (fixture, target, kind) => {
        expect(kindOf(fixtureField(fixture, target))).toBe(kind);
    });

    it('row 3: a hidden text field is marked hidden and still classified as text', () => {
        const key = readFieldKey(textField({ field: { hidden: true } }));
        expect(key.hidden).toBe(true);
        expect(classifyFormField(key)).toBe('text');
    });

    it('row 3a: a read-only text field is unsupported', () => {
        expect(kindOf(textField({ inputOptions: { readOnly: true } }))).toBeUndefined();
    });

    it('row 7: TEXT_INPUT + URL is a url field', () => {
        expect(kindOf(textField({ format: 'URL' }))).toBe('url');
    });

    it('row 14: PHONE_INPUT with UNKNOWN_FORMAT is unsupported', () => {
        expect(kindOf(textField({ componentType: 'PHONE_INPUT' }))).toBeUndefined();
    });

    it('rows 4-5: TEXT_INPUT with an enum is still free text (accepted gap)', () => {
        expect(kindOf(textField({ enumValues: ['a', 'b'] }))).toBe('text');
    });

    it('row 9: a RADIO_GROUP with an enum is a select', () => {
        expect(kindOf(choiceField('RADIO_GROUP', ['a', 'b']))).toBe('select');
    });

    it('row 14: a DROPDOWN with an empty enum is unsupported', () => {
        expect(kindOf(choiceField('DROPDOWN', []))).toBeUndefined();
    });

    it.each(['DROPDOWN', 'RADIO_GROUP'] as const)(
        'row 14: a %s with a customOption is unsupported',
        (componentType) => {
            const field = choiceField(componentType, ['a', 'b'], {
                customOption: { label: 'Other' },
            });
            expect(readFieldKey(field).customOption).toBe(true);
            expect(kindOf(field)).toBeUndefined();
        },
    );

    it('row 14: a CHECKBOX_GROUP with a customOption is unsupported', () => {
        const field = fixtureField('contact-form', 'interests');
        (
            field.inputOptions!.arrayOptions as Record<string, any>
        ).checkboxGroupOptions.customOption = {
            label: 'Other',
        };
        expect(readFieldKey(field).customOption).toBe(true);
        expect(kindOf(field)).toBeUndefined();
    });

    it('row 14: NUMBER is unsupported', () => {
        expect(
            kindOf({
                id: 'n',
                fieldType: 'INPUT',
                inputOptions: {
                    target: 'count',
                    inputType: 'NUMBER',
                    numberOptions: { componentType: 'NUMBER_INPUT' },
                },
            }),
        ).toBeUndefined();
    });

    it('row 14: a missing inputType is unsupported', () => {
        expect(kindOf(textField({ inputOptions: { inputType: undefined } }))).toBeUndefined();
    });

    it('row 14: an unknown component FOO is unsupported', () => {
        expect(kindOf(textField({ componentType: 'FOO' }))).toBeUndefined();
    });

    it('row 9, not 4: identifier TEXT_AREA with component DROPDOWN and an enum is a select', () => {
        const field = choiceField('DROPDOWN', ['a']);
        field.identifier = 'TEXT_AREA';
        expect(kindOf(field)).toBe('select');
    });
});

describe('readFieldView', () => {
    function viewOf(raw: RawFormField) {
        return readFieldView(raw, readFieldKey(raw));
    }

    it('labels the live dropdown options from its options list', () => {
        expect(viewOf(fixtureField('booking-form-all-kinds', 'dropdown_7b7d')).options).toEqual([
            { value: 'Option 1', label: 'Option 1' },
            { value: 'Option 2', label: 'Option 2' },
        ]);
    });

    it('labels the live checkbox-group options', () => {
        expect(viewOf(fixtureField('contact-form', 'interests')).options).toEqual([
            { value: 'News', label: 'News' },
            { value: 'Offers', label: 'Offers' },
            { value: 'Events', label: 'Events' },
        ]);
    });

    it('reads placeholder and length from the documented paths', () => {
        const field = fixtureField('contact-form', 'first_name_5820');
        const stringOptions = field.inputOptions!.stringOptions as Record<string, any>;
        stringOptions.textInputOptions.placeholder = 'Your name';
        stringOptions.validation.minLength = 2;
        expect(viewOf(field)).toMatchObject({ placeholder: 'Your name', minLength: 2 });
    });

    it('has an empty placeholder and no length rules when Wix sets none', () => {
        expect(viewOf(fixtureField('contact-form', 'first_name_5820'))).toEqual({
            placeholder: '',
            minLength: undefined,
            maxLength: undefined,
            pattern: undefined,
            options: [],
        });
    });

    it('drops an options entry outside the enum and keeps a label that differs from its value', () => {
        const field = choiceField('DROPDOWN', ['a']);
        (field.inputOptions!.stringOptions as Record<string, any>).dropdownOptions.options = [
            { value: 'a', label: 'Alpha' },
            { value: 'z', label: 'Zulu' },
        ];
        expect(viewOf(field).options).toEqual([{ value: 'a', label: 'Alpha' }]);
    });

    it('labels an enum value missing from the options list with the value', () => {
        const field = choiceField('DROPDOWN', ['a', 'b']);
        (field.inputOptions!.stringOptions as Record<string, any>).dropdownOptions.options = [
            { value: 'a', label: 'Alpha' },
        ];
        expect(viewOf(field).options).toEqual([
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'b' },
        ]);
    });
});
