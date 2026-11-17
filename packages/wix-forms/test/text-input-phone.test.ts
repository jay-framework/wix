// @vitest-environment node

/**
 * Bug: a phone field made through the Form Schemas API (`STRING` + `TEXT_INPUT` + `PHONE`) is
 *   classified as unsupported, so it is dropped from the form, and a required one blocks the form.
 * Found in: DL #59 branch merge review (testbed /dl55, /dl56 validate failures); fixed by the
 *   DL #51 addendum (2026-11-17).
 * Expected: the field is a `'tel'` field exactly like row 8 (`PHONE_INPUT`): phone rules from
 *   config `defaultPhoneCountry` (a `TEXT_INPUT` has no field-level default country) and E.164 posting.
 * Actual: `classifyFormField` returns undefined and the field is listed in `unsupportedFields`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyFormField, readFieldKey } from '../lib/utils/classify-form-field.js';
import { projectFormFields } from '../lib/utils/project-form-fields.js';
import { toPostedValues } from '../lib/components/submission-values.js';
import type { RawForm, RawFormField } from '../lib/wix-apis/get-form.js';

/** Get Form of the testbed form "QA Test DL54" (2026-11-17), ids redacted. */
function textInputPhoneForm(): RawForm {
    const path = resolve(__dirname, 'fixtures/format-parity/text-input-phone-field-schema.json');
    return (JSON.parse(readFileSync(path, 'utf8')) as { form: RawForm }).form;
}

function phoneRawField(form: RawForm): RawFormField {
    return form.formFields!.find((field) => field.inputOptions?.target === 'phone')!;
}

describe('STRING + TEXT_INPUT + PHONE (DL #51 addendum 2026-11-17)', () => {
    it('should read the live tuple from the capture', () => {
        expect(readFieldKey(phoneRawField(textInputPhoneForm()))).toMatchObject({
            inputType: 'STRING',
            componentType: 'TEXT_INPUT',
            format: 'PHONE',
        });
    });

    it("should classify the field as 'tel'", () => {
        const key = readFieldKey(phoneRawField(textInputPhoneForm()));
        expect(classifyFormField(key)).toBe('tel');
    });

    it('should project the field with phone rules and not list it as unsupported', () => {
        const projected = projectFormFields(textInputPhoneForm(), { defaultPhoneCountry: 'US' });
        expect(projected.unsupportedFields).toEqual([]);
        expect(projected.fields.find((field) => field.target === 'phone')).toMatchObject({
            inputType: 'tel',
            phone: { defaultCountry: 'US' },
        });
    });

    it('should block nothing when the field is required', () => {
        const form = textInputPhoneForm();
        phoneRawField(form).inputOptions!.required = true;
        const projected = projectFormFields(form);
        expect(projected.unsupportedFields).toEqual([]);
        expect(projected.fields.find((field) => field.target === 'phone')).toMatchObject({
            inputType: 'tel',
            required: true,
        });
    });

    it('should post an international number as E.164', () => {
        const { fields } = projectFormFields(textInputPhoneForm());
        expect(toPostedValues(fields, { phone: '+1 202-555-0123' }).phone).toBe('+12025550123');
    });

    it('should post a local number in the defaultPhoneCountry as E.164', () => {
        const { fields } = projectFormFields(textInputPhoneForm(), { defaultPhoneCountry: 'IL' });
        expect(toPostedValues(fields, { phone: '054-123-4567' }).phone).toBe('+972541234567');
    });
});
