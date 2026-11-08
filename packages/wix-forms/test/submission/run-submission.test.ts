// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionError } from '@jay-framework/fullstack-component';
import { WixApiError, type VerifiedCaller } from '@jay-framework/wix-server-client';
import { runSubmission, selectHook, type SubmitDeps } from '../../lib/submission/run-submission.js';
import { SubmitIgnoredError, type SubmitHook } from '../../lib/services/wix-forms-submit-hooks.js';
import { SUBMIT_FAILED_MESSAGE, SubmitFailure } from '../../lib/components/submit-outcome.js';
import type { FieldValue } from '../../lib/types.js';

/**
 * Shaped after the documented Wix Forms 400 body. Not a live capture: DL#41's
 * MUST-VERIFY (`errorPath` equals the field target) is still open.
 */
const FIELD_VIOLATION_BODY = readFileSync(
    resolve(__dirname, '../fixtures/submission/field-violation-400.json'),
    'utf8',
);
const SUBMISSIONS_PATH = '/forms/v4/submissions';
const FORM_ID = 'form-1';
const MEMBER: VerifiedCaller = { type: 'MEMBER', id: 'member-1' };
const CALLER_CLIENT = { marker: 'caller-client' } as never;

const UNKNOWN_FAILURE = {
    success: false,
    reason: SubmitFailure.UNKNOWN,
    message: SUBMIT_FAILED_MESSAGE,
};

const fieldViolation = () => new WixApiError(400, SUBMISSIONS_PATH, FIELD_VIOLATION_BODY);
const forbidden = () => new WixApiError(403, SUBMISSIONS_PATH, '{"message":"forbidden"}');

let errorLog: ReturnType<typeof vi.spyOn>;
let unhandled: unknown[];
const recordUnhandled = (reason: unknown) => void unhandled.push(reason);

beforeEach(() => {
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    unhandled = [];
    process.on('unhandledRejection', recordUnhandled);
});

afterEach(() => {
    errorLog.mockRestore();
    process.off('unhandledRejection', recordUnhandled);
});

/** The log messages written so far (the first console.error argument of each call). */
function loggedMessages(): string[] {
    return errorLog.mock.calls.map((call) => String(call[0]));
}

interface Harness {
    deps: SubmitDeps;
    posts: Array<[string, Record<string, FieldValue>]>;
    resolveIdentity: ReturnType<typeof vi.fn>;
}

function harness(options: { wixFails?: () => unknown; hook?: SubmitHook } = {}): Harness {
    const posts: Harness['posts'] = [];
    const resolveIdentity = vi.fn(async () => ({ caller: MEMBER, client: CALLER_CLIENT }));
    return {
        posts,
        resolveIdentity,
        deps: {
            createSubmission: async (formId, values) => {
                posts.push([formId, values]);
                if (options.wixFails) throw options.wixFails();
            },
            resolveIdentity,
            hook: options.hook,
        },
    };
}

function submitWith(
    deps: SubmitDeps,
    values: Record<string, FieldValue> = { email_4b3a: 'a@b.co' },
) {
    return runSubmission({ formId: FORM_ID, values }, deps);
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runSubmission — V1, row 1 (succeeded)', () => {
    it('should submit the client values with no hook, without resolving identity', async () => {
        const { deps, posts, resolveIdentity } = harness();

        expect(await submitWith(deps)).toEqual({ success: true });
        expect(posts).toEqual([[FORM_ID, { email_4b3a: 'a@b.co' }]]);
        expect(resolveIdentity).not.toHaveBeenCalled();
    });

    it('should send exactly the hook-modified values, including a hidden field the client sent empty', async () => {
        const { deps, posts } = harness({
            hook: async ({ values, submit }) => {
                await submit({ ...values, reference: 'REF-7' });
                return { redirectTo: '/confirmed?ref=REF-7' };
            },
        });

        const result = await submitWith(deps, { email_4b3a: 'a@b.co', reference: '' });

        expect(result).toEqual({ success: true, redirectTo: '/confirmed?ref=REF-7' });
        expect(posts).toEqual([[FORM_ID, { email_4b3a: 'a@b.co', reference: 'REF-7' }]]);
    });

    it('should keep a success when the hook throws after submit() resolved, and log it (L3)', async () => {
        const { deps } = harness({
            hook: async ({ submit }) => {
                await submit();
                throw new Error('post-processing failed');
            },
        });

        expect(await submitWith(deps)).toEqual({ success: true });
        expect(loggedMessages()).toEqual([
            '[wix-forms] the submit hook threw after submit() was called',
        ]);
    });
});

describe('runSubmission — V2, row 2 (Wix field violations)', () => {
    /**
     * Bug: per-field submission errors never reach the browser.
     * Found in: design-log/39 - general forms infrastructure.md, "Known defect found in review + planned fix"
     * Expected: the server maps Wix's field violations and RETURNS { success:false, fieldErrors }.
     * Actual: the WixApiError was thrown and the transport dropped its responseBody.
     */
    it('should return field errors instead of throwing when Wix rejects fields', async () => {
        const { deps } = harness({ wixFails: fieldViolation });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { email_4b3a: 'must be a valid email' },
        });
    });

    const fieldErrorResult = {
        success: false,
        reason: SubmitFailure.VALIDATION,
        fieldErrors: { email_4b3a: 'must be a valid email' },
    };

    it.each(parityHooks())(
        'should give the same field errors when the hook %s',
        async (_label, hook, logs) => {
            const { deps } = harness({ wixFails: fieldViolation, hook });

            expect(await submitWith(deps)).toEqual(fieldErrorResult);
            expect(loggedMessages()).toEqual(logs);
        },
    );
});

describe('runSubmission — V3, row 3 (other Wix failure)', () => {
    it.each([
        ['a 401', () => new WixApiError(401, SUBMISSIONS_PATH, '{}'), SubmitFailure.PERMISSION],
        ['a 403', forbidden, SubmitFailure.PERMISSION],
        ['a 500', () => new WixApiError(500, SUBMISSIONS_PATH, '{}'), SubmitFailure.REJECTED],
        ['a network TypeError', () => new TypeError('fetch failed'), SubmitFailure.UNKNOWN],
    ])(
        'should return the generic message for %s, and log it (L4)',
        async (_label, wixFails, reason) => {
            const { deps } = harness({ wixFails });

            expect(await submitWith(deps)).toEqual({
                success: false,
                reason,
                message: SUBMIT_FAILED_MESSAGE,
            });
            expect(loggedMessages()).toEqual(['[wix-forms] Wix rejected the submission']);
        },
    );

    it.each(parityHooks())(
        'should give the same generic result when the hook %s',
        async (_label, hook, logs) => {
            const { deps } = harness({ wixFails: forbidden, hook });

            expect(await submitWith(deps)).toEqual({
                success: false,
                reason: SubmitFailure.PERMISSION,
                message: SUBMIT_FAILED_MESSAGE,
            });
            expect(loggedMessages()).toEqual([...logs, '[wix-forms] Wix rejected the submission']);
        },
    );
});

/** Hooks that handle a rejected submit() differently; Wix's outcome must decide for all. */
function parityHooks(): Array<[string, SubmitHook, string[]]> {
    const L3 = '[wix-forms] the submit hook threw after submit() was called';
    return [
        ['swallows the rejection', async ({ submit }) => void (await submit().catch(() => {})), []],
        ['rethrows it', async ({ submit }) => submit(), []],
        [
            'rethrows a wrapper',
            async ({ submit }) => {
                await submit().catch((error) => {
                    throw new Error('wrapped', { cause: error });
                });
            },
            [L3],
        ],
        [
            'throws an ActionError after compensating',
            async ({ submit }) => {
                await submit().catch(() => {
                    throw new ActionError('COMPENSATED', 'Reservation released.');
                });
            },
            [L3],
        ],
    ];
}

describe('runSubmission — V4, rows 4–5 (no submit)', () => {
    it('should return an ActionError message thrown before submit(), unlogged', async () => {
        const { deps, posts } = harness({
            hook: async () => {
                throw new ActionError('SLOT_TAKEN', 'That time was just taken.');
            },
        });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.REJECTED,
            message: 'That time was just taken.',
        });
        expect(posts).toEqual([]);
        expect(loggedMessages()).toEqual([]);
    });

    it('should hide a plain Error before submit() behind the generic message, and log it (L5)', async () => {
        const { deps } = harness({
            hook: async () => {
                throw new Error('db down');
            },
        });

        expect(await submitWith(deps)).toEqual(UNKNOWN_FAILURE);
        expect(loggedMessages()).toEqual(['[wix-forms] the submit hook failed before submitting']);
    });

    it('should fail a hook that returns without calling submit(), and log it (L5)', async () => {
        const { deps, posts } = harness({ hook: async () => ({ redirectTo: '/x' }) });

        expect(await submitWith(deps)).toEqual(UNKNOWN_FAILURE);
        expect(posts).toEqual([]);
        expect(loggedMessages()).toEqual([
            '[wix-forms] the submit hook returned without calling submit()',
        ]);
    });
});

describe('runSubmission — V5, attempt lifecycle', () => {
    it('should POST once for two concurrent submit() calls, rejecting the second', async () => {
        let secondCall: unknown;
        const { deps, posts } = harness({
            hook: async ({ submit }) => {
                const [, second] = await Promise.allSettled([submit(), submit()]);
                secondCall = second.status === 'rejected' ? second.reason : second;
            },
        });

        expect(await submitWith(deps)).toEqual({ success: true });
        expect(posts.length).toEqual(1);
        expect(secondCall).toBeInstanceOf(SubmitIgnoredError);
        expect(loggedMessages()).toEqual([
            '[wix-forms] submit() was ignored: it already ran, or the hook had settled',
        ]);
    });

    it('should wait for an un-awaited submit(), with no unhandled rejection when Wix rejects', async () => {
        const { deps, posts } = harness({
            wixFails: forbidden,
            hook: async ({ submit }) => {
                void submit();
            },
        });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.PERMISSION,
            message: SUBMIT_FAILED_MESSAGE,
        });
        await tick();
        expect(posts.length).toEqual(1);
        expect(unhandled).toEqual([]);
    });

    it('should ignore a submit() scheduled after the hook settled', async () => {
        vi.useFakeTimers();
        try {
            const { deps, posts } = harness({
                hook: async ({ submit }) => {
                    setTimeout(() => void submit(), 10);
                },
            });

            expect(await submitWith(deps)).toEqual(UNKNOWN_FAILURE);
            await vi.advanceTimersByTimeAsync(10);
        } finally {
            vi.useRealTimers();
        }
        await tick();

        expect(unhandled).toEqual([]);
        expect(loggedMessages()).toEqual([
            '[wix-forms] the submit hook returned without calling submit()',
            '[wix-forms] submit() was ignored: it already ran, or the hook had settled',
        ]);
    });

    it('should not POST from a late submit()', async () => {
        let lateSubmit: () => Promise<void> = async () => {};
        const { deps, posts } = harness({
            hook: async ({ submit }) => {
                lateSubmit = submit;
            },
        });
        await submitWith(deps);

        await expect(lateSubmit()).rejects.toBeInstanceOf(SubmitIgnoredError);
        expect(posts).toEqual([]);
    });
});

describe('runSubmission — V6, hook selection and identity', () => {
    it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
        'should not select an inherited property "%s" as a hook',
        (formId) => {
            expect(selectHook({ [FORM_ID]: async () => {} }, formId)).toBeUndefined();
        },
    );

    it('should select no hook when none are registered', () => {
        expect(selectHook(undefined, FORM_ID)).toBeUndefined();
    });

    it('should select the hook registered for the form', () => {
        const hook: SubmitHook = async () => {};
        expect(selectHook({ [FORM_ID]: hook }, FORM_ID)).toBe(hook);
    });

    it('should resolve identity once for a hooked form and pass caller and client to the hook', async () => {
        const seen: unknown[] = [];
        const { deps, resolveIdentity } = harness({
            hook: async ({ formId, caller, client, submit }) => {
                seen.push({ formId, caller, client });
                await submit();
            },
        });

        await submitWith(deps);

        expect(resolveIdentity).toHaveBeenCalledTimes(1);
        expect(seen).toEqual([{ formId: FORM_ID, caller: MEMBER, client: CALLER_CLIENT }]);
    });

    it('should not run the hook or POST when identity resolution fails, and log no secret (L1)', async () => {
        const hook = vi.fn(async () => {});
        const { deps, posts, resolveIdentity } = harness({ hook });
        resolveIdentity.mockRejectedValue(new Error('Wix API 503: /oauth2/token-info'));

        expect(await submitWith(deps)).toEqual(UNKNOWN_FAILURE);
        expect(hook).not.toHaveBeenCalled();
        expect(posts).toEqual([]);
        expect(errorLog.mock.calls).toEqual([
            [
                '[wix-forms] could not resolve the caller identity',
                { formId: FORM_ID, error: 'Error: Wix API 503: /oauth2/token-info' },
            ],
        ]);
    });
});
