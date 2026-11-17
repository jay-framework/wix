// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    projectFormSummaryFields,
    validateFormSummaryField,
} from '../lib/utils/project-form-fields.js';
import { toPostedSummaryValues } from '../lib/components/submission-values.js';
import type { FormFieldSummaryView } from '../lib/types.js';

const phoneField: FormFieldSummaryView = {
    target: 'phone',
    label: 'Phone',
    type: 'PHONE',
    required: false,
};

/**
 * Bug: wix-bookings posts a participant phone such as `+1 202-555-0123` to createBooking as
 *   typed; Wix refuses it (HTTP 400) and the visitor sees the generic UNKNOWN failure.
 * Found in: design-log/58 - E.164 participant phones for wix-bookings.md (release QA finding).
 * Expected: the value posted is compact E.164 (`+12025550123`); values checkPhone cannot convert
 *   get a clear browser error instead of reaching Wix.
 * Actual: the value is posted unchanged and the browser regex lets it through.
 */
describe('bookings participant phones (DL #58)', () => {
    it('should post a spaced and dashed international phone as E.164', () => {
        expect(
            toPostedSummaryValues([phoneField], { phone: '+1 202-555-0123', name: 'Ann' }),
        ).toEqual({ phone: '+12025550123', name: 'Ann' });
    });

    it('should keep a compact E.164 phone unchanged', () => {
        expect(toPostedSummaryValues([phoneField], { phone: '+12025550123' })).toEqual({
            phone: '+12025550123',
        });
    });

    it('should post a local phone as E.164 using the default country', () => {
        const ukField = { ...phoneField, phone: { defaultCountry: 'GB' } };
        expect(toPostedSummaryValues([ukField], { phone: '020 7946 0321' })).toEqual({
            phone: '+442079460321',
        });
    });

    it('should refuse a phone that is too short with the phone message', () => {
        expect(validateFormSummaryField(phoneField, '12')).toBe(
            'Please enter a valid phone number.',
        );
    });

    it('should ask for the country code when a local phone has no known country', () => {
        expect(validateFormSummaryField(phoneField, '054.123.4567')).toBe(
            'Please include the country code, starting with +.',
        );
    });

    it('should accept a spaced international phone in the browser check', () => {
        expect(validateFormSummaryField(phoneField, '+1 202-555-0123')).toBe('');
    });

    it('should give summary phone fields the configured default country', () => {
        const { fields } = projectFormSummaryFields(
            [{ target: 'phone', label: 'Phone', type: 'PHONE' }],
            { defaultPhoneCountry: 'GB' },
        );
        expect(fields[0].phone).toEqual({ defaultCountry: 'GB' });
    });
});
