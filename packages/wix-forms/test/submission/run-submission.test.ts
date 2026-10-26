// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WixApiError } from '@jay-framework/wix-server-client';
import { runSubmission } from '../../lib/submission/run-submission.js';

/**
 * Shaped after the documented Wix Forms 400 body. Not a live capture: DL#39's
 * MUST-VERIFY (`errorPath` equals the field target) is still open.
 */
const FIELD_VIOLATION_BODY = readFileSync(
    resolve(__dirname, '../fixtures/submission/field-violation-400.json'),
    'utf8',
);
const SUBMISSIONS_PATH = '/forms/v4/submissions';

describe('runSubmission (DL#39 planned fix)', () => {
    it('should submit the client values and return success', async () => {
        const createSubmission = vi.fn(async () => {});

        const result = await runSubmission(
            { formId: 'form-1', values: { email_4b3a: 'ada@example.com' } },
            { createSubmission },
        );

        expect(result).toEqual({ success: true });
        expect(createSubmission.mock.calls).toEqual([['form-1', { email_4b3a: 'ada@example.com' }]]);
    });

    /**
     * Bug: per-field submission errors never reach the browser.
     * Found in: design-log/39 - general forms infrastructure.md, "Known defect found in review + planned fix"
     * Expected: the server maps Wix's field violations and RETURNS { success:false, fieldErrors },
     *   which survives the action transport.
     * Actual: the WixApiError is thrown; the transport keeps only { code, message } and drops
     *   responseBody, so the client's field-error branch is dead.
     */
    it('should return field errors instead of throwing when Wix rejects fields', async () => {
        const createSubmission = vi.fn(async () => {
            throw new WixApiError(400, SUBMISSIONS_PATH, FIELD_VIOLATION_BODY);
        });

        const result = await runSubmission(
            { formId: 'form-1', values: { email_4b3a: 'not-an-email' } },
            { createSubmission },
        );

        expect(result).toEqual({
            success: false,
            fieldErrors: { email_4b3a: 'must be a valid email' },
        });
    });

    it('should still throw a Wix failure that carries no field violations (403)', async () => {
        const forbidden = new WixApiError(403, SUBMISSIONS_PATH, '{"message":"forbidden"}');

        await expect(
            runSubmission(
                { formId: 'form-1', values: {} },
                {
                    createSubmission: async () => {
                        throw forbidden;
                    },
                },
            ),
        ).rejects.toBe(forbidden);
    });
});
