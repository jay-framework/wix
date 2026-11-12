// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSubmissionViolations } from '../lib/utils/wix-submission-errors.js';
import { FieldRule } from '../lib/components/field-rule.js';

/**
 * Bug: every Wix field error became `SERVER` with validator text (DL#55 Problem 2), so a page's
 *   `EMAIL` copy showed only when the browser caught the error.
 * Found in: design-log/55 - wix validation parity for wix-forms.md §Design 2 (mapping table)
 * Expected: `FORMAT_ERROR` email / phone / url map to EMAIL / PHONE / URL; the rest stays unmapped.
 * Fixtures: captured Wix 400 bodies (DL#55 L1).
 */

function capturedBody(name: string): string {
    return readFileSync(resolve(__dirname, 'fixtures/submission', name), 'utf8');
}

function bodyWithErrors(errors: object[]): string {
    return JSON.stringify({
        details: { validationError: { fieldViolations: [{ data: { errors } }] } },
    });
}

describe('parseSubmissionViolations (DL#55 P2)', () => {
    it('should map the captured email + url format errors', () => {
        expect(parseSubmissionViolations(capturedBody('field-violation-400.json'))).toEqual({
            fieldErrors: { email: 'must match format "email"', website: 'must match format "url"' },
            fieldRules: { email: FieldRule.EMAIL, website: FieldRule.URL },
        });
    });

    it('should map the captured email + phone format errors', () => {
        expect(parseSubmissionViolations(capturedBody('phone-format-400.json'))).toEqual({
            fieldErrors: { email: 'must match format "email"', phone: 'must match format "phone"' },
            fieldRules: { email: FieldRule.EMAIL, phone: FieldRule.PHONE },
        });
    });

    it('should leave captured TYPE_ERROR targets unmapped', () => {
        expect(parseSubmissionViolations(capturedBody('type-error-400.json'))).toEqual({
            fieldErrors: {
                email_7e06: 'must match format "email"',
                interests: 'must be array',
                form_field_aa5f: 'must be boolean',
            },
            fieldRules: { email_7e06: FieldRule.EMAIL },
        });
    });

    it('should leave the captured unknown key unmapped, with its text', () => {
        expect(parseSubmissionViolations(capturedBody('unknown-key-400.json'))).toEqual({
            fieldErrors: {
                not_a_field: 'must NOT have additional properties',
                email: 'must match format "email"',
            },
            fieldRules: { email: FieldRule.EMAIL },
        });
    });

    it('should read params.format case-insensitively', () => {
        const body = bodyWithErrors([
            {
                errorPath: 'email',
                errorType: 'FORMAT_ERROR',
                errorMessage: 'bad',
                params: { format: 'EMAIL' },
            },
        ]);
        expect(parseSubmissionViolations(body).fieldRules).toEqual({ email: FieldRule.EMAIL });
    });

    describe('shape not observed live', () => {
        it('should map REQUIRED_VALUE_ERROR to REQUIRED', () => {
            const body = bodyWithErrors([
                {
                    errorPath: 'full_name',
                    errorType: 'REQUIRED_VALUE_ERROR',
                    errorMessage: 'is required',
                },
            ]);
            expect(parseSubmissionViolations(body)).toEqual({
                fieldErrors: { full_name: 'is required' },
                fieldRules: { full_name: FieldRule.REQUIRED },
            });
        });

        it("should keep a customErrorMessage unmapped, with the owner's text", () => {
            const body = bodyWithErrors([
                {
                    errorPath: 'full_name',
                    errorType: 'REQUIRED_VALUE_ERROR',
                    errorMessage: 'is required',
                    customErrorMessage: 'Tell us your name',
                },
            ]);
            expect(parseSubmissionViolations(body)).toEqual({
                fieldErrors: { full_name: 'Tell us your name' },
                fieldRules: {},
            });
        });

        it('should take text and rule from the first item of a target', () => {
            const body = bodyWithErrors([
                { errorPath: 'phone', errorType: 'TYPE_ERROR', errorMessage: 'must be string' },
                {
                    errorPath: 'phone',
                    errorType: 'FORMAT_ERROR',
                    errorMessage: 'bad',
                    params: { format: 'phone' },
                },
            ]);
            expect(parseSubmissionViolations(body)).toEqual({
                fieldErrors: { phone: 'must be string' },
                fieldRules: {},
            });
        });

        // Regression guard: items without errorPath are dropped, as before DL#55.
        it('should drop an item without errorPath', () => {
            const body = bodyWithErrors([
                { errorType: 'DISABLED_FORM_ERROR', errorMessage: 'disabled' },
            ]);
            expect(parseSubmissionViolations(body)).toEqual({ fieldErrors: {}, fieldRules: {} });
        });
    });

    // Regression guards, moved from project-form-fields.test.ts (parseSubmissionFieldErrors).
    it('should parse Wix validation error response into field errors', () => {
        const body = bodyWithErrors([
            { errorPath: 'email', errorMessage: 'Invalid email address' },
        ]);
        expect(parseSubmissionViolations(body)).toEqual({
            fieldErrors: { email: 'Invalid email address' },
            fieldRules: {},
        });
    });

    it('should return empty violations for invalid JSON', () => {
        expect(parseSubmissionViolations('not json')).toEqual({ fieldErrors: {}, fieldRules: {} });
    });
});
