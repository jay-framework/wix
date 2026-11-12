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
import { FieldRule } from '../lib/components/field-rule.js';

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
            ruleByTarget: { email: FieldRule.SERVER },
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
            ruleByTarget: {},
            statusMessage: 'Reference: is required',
        });
    });

    it('should show an unknown target by its name', () => {
        expect(
            presentSubmitRejection({ success: false, fieldErrors: { mystery: 'nope' } }, FIELDS),
        ).toEqual({
            errorByTarget: {},
            invalidByTarget: {},
            ruleByTarget: {},
            statusMessage: 'mystery: nope',
        });
    });

    it('should show the generic message when there is nothing else to show', () => {
        expect(presentSubmitRejection({ success: false, fieldErrors: {} }, FIELDS)).toEqual({
            errorByTarget: {},
            invalidByTarget: {},
            ruleByTarget: {},
            statusMessage: SUBMIT_FAILED_MESSAGE,
        });
    });
});

describe('presentSubmitRejection with a form-level message (V10)', () => {
    it('should show the message alone when there are no field errors', () => {
        expect(presentSubmitRejection({ success: false, message: 'Slot taken.' }, FIELDS)).toEqual({
            errorByTarget: {},
            invalidByTarget: {},
            ruleByTarget: {},
            statusMessage: 'Slot taken.',
        });
    });

    it('should list hidden-field errors after the message', () => {
        expect(
            presentSubmitRejection(
                {
                    success: false,
                    message: 'Please check the form.',
                    fieldErrors: { reference: 'is required', email: 'Bad' },
                },
                FIELDS,
            ),
        ).toEqual({
            errorByTarget: { email: 'Bad' },
            invalidByTarget: { email: true },
            ruleByTarget: { email: FieldRule.SERVER },
            statusMessage: 'Please check the form. Reference: is required',
        });
    });
});

describe('presentSubmitRejection with the DL#43 caller messages', () => {
    it.each([
        [SUBMIT_NOT_ALLOWED_MESSAGE, 'Please sign in to submit this form.'],
        [
            SUBMIT_SESSION_EXPIRED_MESSAGE,
            'Your session expired. Please refresh the page and try again.',
        ],
    ])('should render %j as its exact copy', (message, copy) => {
        expect(presentSubmitRejection({ success: false, message }, FIELDS)).toEqual({
            errorByTarget: {},
            invalidByTarget: {},
            ruleByTarget: {},
            statusMessage: copy,
        });
    });
});

/**
 * Bug: a Wix field error the plugin classifies still showed as `SERVER` with validator text
 *   (DL#55 Problem 2), so the page's `EMAIL` copy never showed for it.
 * Found in: design-log/55 - wix validation parity for wix-forms.md §Design 2 (Client)
 * Expected: a classified target gets its rule and the plugin default text.
 */
describe('presentSubmitRejection with server field rules (DL#55 P2)', () => {
    const wixEmailError = { email: 'must match format "email"' };

    it('should show the default text and rule of a classified server error', () => {
        const view = presentSubmitRejection(
            { success: false, fieldErrors: wixEmailError, fieldRules: { email: FieldRule.EMAIL } },
            FIELDS,
        );
        expect(view.ruleByTarget.email).toBe(FieldRule.EMAIL);
        expect(view.errorByTarget.email).toBe('Please enter a valid email address.');
    });

    it("should keep Wix's text when the default cannot be filled", () => {
        const fields = [field('name', 'Name')];
        const view = presentSubmitRejection(
            {
                success: false,
                fieldErrors: { name: 'must NOT have fewer than 3 characters' },
                fieldRules: { name: FieldRule.MIN_LENGTH },
            },
            fields,
        );
        expect(view.ruleByTarget.name).toBe(FieldRule.MIN_LENGTH);
        expect(view.errorByTarget.name).toBe('must NOT have fewer than 3 characters');
    });

    it("should mark an unclassified server error SERVER with Wix's text", () => {
        const view = presentSubmitRejection({ success: false, fieldErrors: wixEmailError }, FIELDS);
        expect(view.ruleByTarget.email).toBe(FieldRule.SERVER);
        expect(view.errorByTarget.email).toBe('must match format "email"');
    });

    // Regression guard: hidden targets keep the status line with Wix's text.
    it("should list a hidden classified target in the status line with Wix's text", () => {
        const view = presentSubmitRejection(
            {
                success: false,
                fieldErrors: { reference: 'must match format "url"' },
                fieldRules: { reference: FieldRule.URL },
            },
            FIELDS,
        );
        expect(view.statusMessage).toBe('Reference: must match format "url"');
        expect(view.ruleByTarget).toEqual({});
    });
});

// Regression guard (DL #56 H): `fromHook` marks every returned field error HOOK, over fieldRules.
describe('presentSubmitRejection with a hook rejection (DL #56 H)', () => {
    it("should mark a hook field error HOOK with the hook's text", () => {
        const view = presentSubmitRejection(
            {
                success: false,
                fromHook: true,
                fieldErrors: { email: 'This address is on the block list.' },
                fieldRules: { email: FieldRule.EMAIL },
            },
            FIELDS,
        );
        expect(view.ruleByTarget.email).toBe(FieldRule.HOOK);
        expect(view.errorByTarget.email).toBe('This address is on the block list.');
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
