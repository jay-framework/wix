// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { presentSubmitRejection, SUBMIT_FAILED_MESSAGE } from '../lib/components/submit-outcome.js';
import type { FormFieldView } from '../lib/types.js';

function field(target: string, label: string, hidden = false): FormFieldView {
    return {
        target,
        label,
        inputType: 'text',
        required: true,
        placeholder: '',
        options: [],
        hidden,
    };
}

const FIELDS = [field('email', 'Email'), field('reference', 'Reference', true)];

describe('presentSubmitRejection', () => {
    it('should put a visible field error on that field', () => {
        expect(
            presentSubmitRejection({ success: false, fieldErrors: { email: 'Bad email' } }, FIELDS),
        ).toEqual({
            errorByTarget: { email: 'Bad email' },
            invalidByTarget: { email: true },
            statusMessage: '',
        });
    });

    it('should show a hidden field error in the status message as "label: message"', () => {
        expect(
            presentSubmitRejection(
                { success: false, fieldErrors: { reference: 'is required' } },
                FIELDS,
            ),
        ).toEqual({
            errorByTarget: {},
            invalidByTarget: {},
            statusMessage: 'Reference: is required',
        });
    });

    it('should show an unknown target by its name', () => {
        expect(
            presentSubmitRejection({ success: false, fieldErrors: { mystery: 'nope' } }, FIELDS),
        ).toEqual({ errorByTarget: {}, invalidByTarget: {}, statusMessage: 'mystery: nope' });
    });

    it('should show the generic message when there is nothing else to show', () => {
        expect(presentSubmitRejection({ success: false, fieldErrors: {} }, FIELDS)).toEqual({
            errorByTarget: {},
            invalidByTarget: {},
            statusMessage: SUBMIT_FAILED_MESSAGE,
        });
    });
});
