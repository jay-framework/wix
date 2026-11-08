// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionError } from '@jay-framework/fullstack-component';
import {
    resolveRequestIdentity,
    WIX_SESSION_COOKIE,
    WixApiError,
    type VerifiedCaller,
} from '@jay-framework/wix-server-client';
import {
    createSubmitAttempt,
    identitySubmitDeps,
    runSubmission,
    selectHook,
    type CallerSession,
    type SubmitDeps,
} from '../../lib/submission/run-submission.js';
import {
    SessionExpiredError,
    SubmitIgnoredError,
    type SubmitHook,
} from '../../lib/services/wix-forms-submit-hooks.js';
import {
    SUBMIT_FAILED_MESSAGE,
    SUBMIT_SESSION_EXPIRED_MESSAGE,
    SubmitFailure,
} from '../../lib/components/submit-outcome.js';
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
    /** The `authorization` of each post: the caller's token, or undefined for the site client. */
    authorizations: Array<string | undefined>;
    resolveIdentity: ReturnType<typeof vi.fn>;
    resolveClient: ReturnType<typeof vi.fn>;
}

interface HarnessOptions {
    wixFails?: () => unknown;
    hook?: SubmitHook;
    /** The request's caller session; default: no session cookie. */
    session?: CallerSession;
}

function harness(options: HarnessOptions = {}): Harness {
    const posts: Harness['posts'] = [];
    const authorizations: Harness['authorizations'] = [];
    const resolveIdentity = vi.fn(async () => ({ caller: MEMBER, client: CALLER_CLIENT }));
    const resolveClient = vi.fn((): CallerSession => options.session ?? { session: 'none' });
    return {
        posts,
        authorizations,
        resolveIdentity,
        resolveClient,
        deps: {
            createSubmission: async (formId, values, authorization) => {
                posts.push([formId, values]);
                authorizations.push(authorization);
                if (options.wixFails) throw options.wixFails();
            },
            resolveIdentity,
            resolveClient,
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

const CALLER_TOKEN = 'caller-access-token';
const CALLER_REFRESH_TOKEN = 'caller-refresh-token';
const L4 = '[wix-forms] Wix rejected the submission';
const L6 = "[wix-forms] Wix refused the caller's submission";

function nowInSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function activeSession(): CallerSession {
    return { session: 'active', authorization: CALLER_TOKEN, expiresAt: nowInSeconds() + 3600 };
}

function expiredSession(): CallerSession {
    return { session: 'expired', expiresAt: nowInSeconds() + 30 };
}

const wixRefusal = (status: number, code: string) => () =>
    new WixApiError(
        status,
        SUBMISSIONS_PATH,
        JSON.stringify({ details: { applicationError: { code } } }),
    );

describe('runSubmission — DL#43, who the submission posts as', () => {
    it('should post with the caller client when the request has a session', async () => {
        const { deps, authorizations } = harness({ session: activeSession() });

        expect(await submitWith(deps)).toEqual({ success: true });
        expect(authorizations).toEqual([CALLER_TOKEN]);
    });

    it('should post with the site client when there is no session', async () => {
        const { deps, authorizations } = harness();

        expect(await submitWith(deps)).toEqual({ success: true });
        expect(authorizations).toEqual([undefined]);
    });

    it("should post as the site when the hook passes { as: 'site' }", async () => {
        const { deps, authorizations } = harness({
            session: activeSession(),
            hook: async ({ submit }) => submit(undefined, { as: 'site' }),
        });

        expect(await submitWith(deps)).toEqual({ success: true });
        expect(authorizations).toEqual([undefined]);
    });

    it("{ as: 'site' } with an expired cookie should still post as the site", async () => {
        const { deps, authorizations } = harness({
            session: expiredSession(),
            hook: async ({ submit }) => submit(undefined, { as: 'site' }),
        });

        expect(await submitWith(deps)).toEqual({ success: true });
        expect(authorizations).toEqual([undefined]);
    });
});

describe('runSubmission — DL#43, an expired session', () => {
    it('a form without a hook and an expired session returns SUBMIT_SESSION_EXPIRED_MESSAGE and never posts', async () => {
        const { deps, posts } = harness({ session: expiredSession() });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.PERMISSION,
            message: SUBMIT_SESSION_EXPIRED_MESSAGE,
        });
        expect(posts).toEqual([]);
    });

    it('submit() on an expired session rejects with SessionExpiredError, consumes the attempt, and a second submit() is ignored (L2)', async () => {
        const rejections: unknown[] = [];
        const { deps, posts } = harness({
            session: expiredSession(),
            hook: async ({ submit }) => {
                await submit().catch((error) => rejections.push(error));
                await submit().catch((error) => rejections.push(error));
            },
        });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.PERMISSION,
            message: SUBMIT_SESSION_EXPIRED_MESSAGE,
        });
        expect(rejections.map((error) => (error as Error).constructor)).toEqual([
            SessionExpiredError,
            SubmitIgnoredError,
        ]);
        expect(posts).toEqual([]);
        expect(loggedMessages()).toEqual([
            '[wix-forms] submit() was ignored: it already ran, or the hook had settled',
        ]);
    });

    it('submit re-checks expiry: a token that lapsed during the hook is not posted', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            const { deps, posts } = harness({
                session: activeSession(),
                hook: async ({ submit }) => {
                    vi.setSystemTime(Date.now() + 3600 * 1000);
                    await submit();
                },
            });

            expect(await submitWith(deps)).toEqual({
                success: false,
                reason: SubmitFailure.PERMISSION,
                message: SUBMIT_SESSION_EXPIRED_MESSAGE,
            });
            expect(posts).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('runSubmission — DL#43, resolving the caller session', () => {
    it('an active session without authorization logs L1, returns SUBMIT_FAILED_MESSAGE, never posts', async () => {
        const { deps, posts } = harness({
            session: { session: 'active', expiresAt: nowInSeconds() + 3600 },
        });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.UNKNOWN,
            message: SUBMIT_FAILED_MESSAGE,
        });
        expect(posts).toEqual([]);
        expect(loggedMessages()).toEqual(['[wix-forms] could not resolve the caller identity']);
    });

    it('resolveClient throwing (no server init) returns SUBMIT_FAILED_MESSAGE and never posts as the site', async () => {
        const { deps, posts, resolveClient } = harness();
        resolveClient.mockImplementation(() => {
            throw new Error('wix-server-client: no OAuth client id.');
        });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.UNKNOWN,
            message: SUBMIT_FAILED_MESSAGE,
        });
        expect(posts).toEqual([]);
        expect(loggedMessages()).toEqual(['[wix-forms] could not resolve the caller identity']);
    });

    it('a form without a hook does not call token-info', async () => {
        const fetchImpl = vi.fn(async () => new Response('{}'));
        const cookie = Buffer.from(
            JSON.stringify({
                accessToken: { value: CALLER_TOKEN, expiresAt: nowInSeconds() + 3600 },
                refreshToken: { value: CALLER_REFRESH_TOKEN, role: 'member' },
            }),
        ).toString('base64url');
        const identity = resolveRequestIdentity(
            { [WIX_SESSION_COOKIE]: cookie },
            fetchImpl as never,
        );
        const authorizations: Array<string | undefined> = [];

        const result = await runSubmission(
            { formId: FORM_ID, values: {} },
            {
                ...identitySubmitDeps(identity),
                createSubmission: async (_formId, _values, authorization) =>
                    void authorizations.push(authorization),
            },
        );

        expect(result).toEqual({ success: true });
        expect(authorizations).toEqual([CALLER_TOKEN]);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe('runSubmission — DL#43, Wix refuses a caller post', () => {
    it('does not retry as the site when Wix refuses the caller', async () => {
        const { deps, authorizations } = harness({ session: activeSession(), wixFails: forbidden });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.PERMISSION,
            message: SUBMIT_FAILED_MESSAGE,
        });
        expect(authorizations).toEqual([CALLER_TOKEN]);
        expect(loggedMessages()).toEqual([L6]);
    });

    it('the caller-refusal branch applies when the hook rethrows the submit error', async () => {
        const { deps, posts } = harness({
            session: activeSession(),
            wixFails: forbidden,
            hook: async ({ submit }) => submit(),
        });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.PERMISSION,
            message: SUBMIT_FAILED_MESSAGE,
        });
        expect(posts.length).toEqual(1);
        expect(loggedMessages()).toEqual([L6]);
    });

    it('a caller 428 INVALID_CAPTCHA returns SUBMIT_FAILED_MESSAGE, no retry', async () => {
        const { deps, posts } = harness({
            session: activeSession(),
            wixFails: wixRefusal(428, 'INVALID_CAPTCHA'),
        });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.REJECTED,
            message: SUBMIT_FAILED_MESSAGE,
        });
        expect(posts.length).toEqual(1);
        expect(loggedMessages()).toEqual([L6]);
    });

    it.each([
        ['caller', activeSession()],
        ['site', { session: 'none' } as CallerSession],
    ])('428 SITE_IS_A_TEMPLATE takes the generic path for a %s post', async (_label, session) => {
        const { deps } = harness({ session, wixFails: wixRefusal(428, 'SITE_IS_A_TEMPLATE') });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.REJECTED,
            message: SUBMIT_FAILED_MESSAGE,
        });
        expect(loggedMessages()).toEqual([L4]);
    });

    it('a 403 on a site post keeps the generic message', async () => {
        const { deps } = harness({ wixFails: forbidden });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.PERMISSION,
            message: SUBMIT_FAILED_MESSAGE,
        });
        expect(loggedMessages()).toEqual([L4]);
    });

    it('field violations on a caller post still return fieldErrors', async () => {
        const { deps } = harness({ session: activeSession(), wixFails: fieldViolation });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { email_4b3a: 'must be a valid email' },
        });
    });

    it('no token appears in the logs', async () => {
        const { deps } = harness({ session: activeSession(), wixFails: forbidden });

        await submitWith(deps);

        const logged = JSON.stringify(errorLog.mock.calls);
        expect([logged.includes(CALLER_TOKEN), logged.includes(CALLER_REFRESH_TOKEN)]).toEqual([
            false,
            false,
        ]);
    });

    it.skip('pending V2: a caller refusal with the V2-recorded status returns SUBMIT_NOT_ALLOWED_MESSAGE (no forms status is recorded yet)', () => {});
});

describe('createSubmitAttempt — DL#43 postedAs', () => {
    const post = async () => {};

    it("postedAs is 'site' when forced with { as: 'site' }", async () => {
        const attempt = createSubmitAttempt(FORM_ID, {}, post, activeSession());

        await attempt.submit(undefined, { as: 'site' });

        expect(attempt.postedAs).toEqual('site');
    });

    it("postedAs is 'site' with no session", async () => {
        const attempt = createSubmitAttempt(FORM_ID, {}, post, { session: 'none' });

        await attempt.submit();

        expect(attempt.postedAs).toEqual('site');
    });

    it("postedAs is 'caller' with an active session", async () => {
        const attempt = createSubmitAttempt(FORM_ID, {}, post, activeSession());

        await attempt.submit();

        expect(attempt.postedAs).toEqual('caller');
    });
});
