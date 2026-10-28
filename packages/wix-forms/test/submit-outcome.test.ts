// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    presentSubmitRejection,
    SUBMIT_FAILED_MESSAGE,
    SUBMIT_NOT_ALLOWED_MESSAGE,
    SUBMIT_SESSION_EXPIRED_MESSAGE,
    toSitePath,
} from '../lib/components/submit-outcome.js';
import type { FormFieldView } from '../lib/types.js';

function field(target: string, label: string, hidden = false): FormFieldView {
    return { target, label, inputType: 'text', required: true, placeholder: '', options: [], hidden };
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
            presentSubmitRejection({ success: false, fieldErrors: { reference: 'is required' } }, FIELDS),
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

describe('presentSubmitRejection with a form-level message (V10)', () => {
    it('should show the message alone when there are no field errors', () => {
        expect(presentSubmitRejection({ success: false, message: 'Slot taken.' }, FIELDS)).toEqual({
            errorByTarget: {},
            invalidByTarget: {},
            statusMessage: 'Slot taken.',
        });
    });

    it('should list hidden-field errors after the message', () => {
        expect(
            presentSubmitRejection(
                { success: false, message: 'Please check the form.', fieldErrors: { reference: 'is required', email: 'Bad' } },
                FIELDS,
            ),
        ).toEqual({
            errorByTarget: { email: 'Bad' },
            invalidByTarget: { email: true },
            statusMessage: 'Please check the form. Reference: is required',
        });
    });
});

describe('presentSubmitRejection with the DL#41 caller messages', () => {
    it.each([
        [SUBMIT_NOT_ALLOWED_MESSAGE, 'Please sign in to submit this form.'],
        [SUBMIT_SESSION_EXPIRED_MESSAGE, 'Your session expired. Please refresh the page and try again.'],
    ])('should render %j as its exact copy', (message, copy) => {
        expect(presentSubmitRejection({ success: false, message }, FIELDS)).toEqual({
            errorByTarget: {},
            invalidByTarget: {},
            statusMessage: copy,
        });
    });
});

describe('toSitePath (V9)', () => {
    it.each([
        'https://x',
        '//x',
        'x',
        '/\\evil.com',
        '\\/evil.com',
        '/\t/evil.com',
        '/\n/evil.com',
        '/\u0000x',
        '/..//evil.com',
        '/.//evil.com',
        '/a/..//evil.com',
        '/%2e%2e//evil.com',
    ])('should reject %j', (candidate) => {
        expect(toSitePath(candidate)).toBeUndefined();
    });

    it.each([undefined, null, 42, {}, ['/a']])('should reject the non-string %j', (candidate) => {
        expect(toSitePath(candidate)).toBeUndefined();
    });

    it('should keep a same-site path with its query and hash, idempotently', () => {
        expect(toSitePath('/a?b=1#h')).toEqual('/a?b=1#h');
        expect(toSitePath(toSitePath('/a?b=1#h'))).toEqual('/a?b=1#h');
    });
});
