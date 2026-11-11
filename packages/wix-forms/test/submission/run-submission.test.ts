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
    FieldRejection,
    NoCallerSessionError,
    SessionExpiredError,
    SubmitIgnoredError,
    type SubmitHook,
} from '../../lib/services/wix-forms-submit-hooks.js';
import {
    SUBMIT_FAILED_MESSAGE,
    SUBMIT_NOT_ALLOWED_MESSAGE,
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
const FORM_ID = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
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
    /** The request's caller session; default: an active session (a real browser). */
    session?: CallerSession;
    /**
     * Post with `{ as: 'site' }`: the only way to reach the site path (DL #50). With `hook`, the
     * hook's `submit` adds `as: 'site'`; without, a hook that submits as the site is installed.
     */
    forceSite?: true;
    isSubmittableForm?: SubmitDeps['isSubmittableForm'];
}

function harness(options: HarnessOptions = {}): Harness {
    const posts: Harness['posts'] = [];
    const authorizations: Harness['authorizations'] = [];
    const resolveIdentity = vi.fn(async () => ({ caller: MEMBER, client: CALLER_CLIENT }));
    const resolveClient = vi.fn((): CallerSession => options.session ?? activeSession());
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
            isSubmittableForm: options.isSubmittableForm ?? (async () => true),
            hook: options.forceSite ? siteForcingHook(options.hook) : options.hook,
        },
    };
}

/** Returns the real `submit()` promise as is: an `async` wrapper would add a second, unhandled one. */
function siteForcingHook(hook?: SubmitHook): SubmitHook {
    if (!hook) return ({ submit }) => submit(undefined, { as: 'site' });
    return (input) =>
        hook({
            ...input,
            submit: (values, options) => input.submit(values, { ...options, as: 'site' }),
        });
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
            const { deps } = harness({ wixFails, forceSite: true });

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
            const { deps } = harness({ wixFails: forbidden, hook, forceSite: true });

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
            code: 'SLOT_TAKEN', // DL#53 G3
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
            forceSite: true,
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
                isSubmittableForm: async () => true,
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
    it('a caller 403 returns SUBMIT_NOT_ALLOWED_MESSAGE and does not retry as the site', async () => {
        const { deps, authorizations } = harness({ session: activeSession(), wixFails: forbidden });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.PERMISSION,
            message: SUBMIT_NOT_ALLOWED_MESSAGE,
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
            message: SUBMIT_NOT_ALLOWED_MESSAGE,
        });
        expect(posts.length).toEqual(1);
        expect(loggedMessages()).toEqual([L6]);
    });

    it('a caller 401 (invalid or expired token) keeps the generic message', async () => {
        const { deps } = harness({
            session: activeSession(),
            wixFails: wixRefusal(401, 'UNAUTHENTICATED'),
        });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.PERMISSION,
            message: SUBMIT_FAILED_MESSAGE,
        });
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
        ['caller', {}],
        ['site', { forceSite: true }],
    ] as Array<[string, HarnessOptions]>)(
        '428 SITE_IS_A_TEMPLATE takes the generic path for a %s post',
        async (_label, postAs) => {
            const { deps } = harness({
                ...postAs,
                wixFails: wixRefusal(428, 'SITE_IS_A_TEMPLATE'),
            });

            expect(await submitWith(deps)).toEqual({
                success: false,
                reason: SubmitFailure.REJECTED,
                message: SUBMIT_FAILED_MESSAGE,
            });
            expect(loggedMessages()).toEqual([L4]);
        },
    );

    it('a 403 on a site post keeps the generic message', async () => {
        const { deps } = harness({ wixFails: forbidden, forceSite: true });

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
});

describe('createSubmitAttempt — DL#43 postedAs', () => {
    const post = async () => {};

    it("postedAs is 'site' when forced with { as: 'site' }", async () => {
        const attempt = createSubmitAttempt(FORM_ID, {}, post, activeSession());

        await attempt.submit(undefined, { as: 'site' });

        expect(attempt.postedAs).toEqual('site');
    });

    it("postedAs is 'caller' with an active session", async () => {
        const attempt = createSubmitAttempt(FORM_ID, {}, post, activeSession());

        await attempt.submit();

        expect(attempt.postedAs).toEqual('caller');
    });
});

const L7 = '[wix-forms] refused a submission for a form that is not submittable';
const L8 = '[wix-forms] could not load the submittable forms';
const L9 = '[wix-forms] refused a submission without a session cookie';
const UNLISTED_FORM_ID = '00000000-0000-4000-8000-000000000000';
const NO_SESSION: CallerSession = { session: 'none' };

const REJECTED_FAILURE = {
    success: false,
    reason: SubmitFailure.REJECTED,
    message: SUBMIT_FAILED_MESSAGE,
};
const NO_COOKIE_FAILURE = {
    success: false,
    reason: SubmitFailure.PERMISSION,
    message: SUBMIT_FAILED_MESSAGE,
};

/** Only `FORM_ID` is submittable. */
const onlyFormId = async (formId: string) => formId === FORM_ID;

function submitFormId(deps: SubmitDeps, formId: string) {
    return runSubmission({ formId, values: {} }, deps);
}

describe('runSubmission — DL #50, the submit allowlist', () => {
    it('should refuse an unknown id without posting or resolving identity (L7)', async () => {
        const { deps, posts, resolveIdentity } = harness({ isSubmittableForm: onlyFormId });

        expect(await submitFormId(deps, UNLISTED_FORM_ID)).toEqual(REJECTED_FAILURE);
        expect(posts).toEqual([]);
        expect(resolveIdentity).not.toHaveBeenCalled();
        expect(errorLog.mock.calls).toEqual([[L7, { formId: UNLISTED_FORM_ID }]]);
    });

    it('should refuse a non-GUID id without asking the allowlist, logged as not a form id', async () => {
        const isSubmittableForm = vi.fn(async () => true);
        const { deps, posts } = harness({ isSubmittableForm });

        expect(await submitFormId(deps, 'contact-us')).toEqual(REJECTED_FAILURE);
        expect(posts).toEqual([]);
        expect(isSubmittableForm).not.toHaveBeenCalled();
        expect(errorLog.mock.calls).toEqual([[L7, { formId: '<not a form id>' }]]);
    });

    it('should return UNKNOWN without posting when the allowlist cannot load (L8)', async () => {
        const { deps, posts } = harness({
            isSubmittableForm: async () => {
                throw new Error('Wix API 503');
            },
        });

        expect(await submitWith(deps)).toEqual(UNKNOWN_FAILURE);
        expect(posts).toEqual([]);
        expect(errorLog.mock.calls).toEqual([
            [L8, { formId: FORM_ID, error: 'Error: Wix API 503' }],
        ]);
    });

    it('should refuse a hooked form outside the allowlist before its hook or identity runs (L7)', async () => {
        const hook = vi.fn(async ({ submit }: Parameters<SubmitHook>[0]) => submit());
        const { deps, posts, resolveIdentity } = harness({
            hook,
            isSubmittableForm: async () => false,
        });

        expect(await submitWith(deps)).toEqual(REJECTED_FAILURE);
        expect(hook).not.toHaveBeenCalled();
        expect(resolveIdentity).not.toHaveBeenCalled();
        expect(posts).toEqual([]);
        expect(loggedMessages()).toEqual([L7]);
    });

    it('Q3 order pin: without a cookie, an unlisted id is REJECTED and a listed unhooked id PERMISSION', async () => {
        const isSubmittableForm = vi.fn(onlyFormId);
        const { deps } = harness({ session: NO_SESSION, isSubmittableForm });

        expect(await submitFormId(deps, UNLISTED_FORM_ID)).toEqual(REJECTED_FAILURE);
        expect(isSubmittableForm).toHaveBeenCalledWith(UNLISTED_FORM_ID);
        expect(await submitFormId(deps, FORM_ID)).toEqual(NO_COOKIE_FAILURE);
        expect(loggedMessages()).toEqual([L7, L9]);
    });

    it('should run the hook of a form sent in upper case and post the canonical id', async () => {
        const seen: string[] = [];
        const { deps, posts } = harness({
            hook: async ({ formId, submit }) => {
                seen.push(formId);
                await submit();
            },
        });

        expect(await submitFormId(deps, FORM_ID.toUpperCase())).toEqual({ success: true });
        expect(seen).toEqual([FORM_ID]);
        expect(posts).toEqual([[FORM_ID, {}]]);
    });
});

describe('runSubmission — DL #50, a request without a session cookie', () => {
    it('should refuse an unhooked form with PERMISSION and the generic message, without posting (L9)', async () => {
        const { deps, posts } = harness({ session: NO_SESSION });

        expect(await submitWith(deps)).toEqual(NO_COOKIE_FAILURE);
        expect(posts).toEqual([]);
        expect(errorLog.mock.calls).toEqual([[L9, { formId: FORM_ID }]]);
    });

    it('should refuse a hook that calls submit(), which sees a NoCallerSessionError', async () => {
        const rejections: unknown[] = [];
        const { deps, posts } = harness({
            session: NO_SESSION,
            hook: async ({ submit }) => {
                await submit().catch((error) => {
                    rejections.push(error);
                    throw error;
                });
            },
        });

        expect(await submitWith(deps)).toEqual(NO_COOKIE_FAILURE);
        expect(rejections.map((error) => (error as Error).constructor)).toEqual([
            NoCallerSessionError,
        ]);
        expect(posts).toEqual([]);
        expect(loggedMessages()).toEqual([L9]);
    });

    it('should post with the caller authorization when the request has a visitor cookie', async () => {
        const { deps, authorizations } = harness({ session: activeSession() });

        expect(await submitWith(deps)).toEqual({ success: true });
        expect(authorizations).toEqual([CALLER_TOKEN]);
    });

    it("should post with the site client when the hook passes { as: 'site' } without a cookie", async () => {
        const { deps, authorizations } = harness({
            session: NO_SESSION,
            hook: async ({ submit }) => submit(undefined, { as: 'site' }),
        });

        expect(await submitWith(deps)).toEqual({ success: true });
        expect(authorizations).toEqual([undefined]);
    });
});

describe('createSubmitAttempt — DL #50, no session cookie', () => {
    it('should fail the attempt with NoCallerSessionError and not post', async () => {
        const post = vi.fn(async () => {});
        const attempt = createSubmitAttempt(FORM_ID, {}, post, NO_SESSION);

        await expect(attempt.submit()).rejects.toBeInstanceOf(NoCallerSessionError);
        expect([attempt.state, attempt.postedAs]).toEqual(['failed', 'caller']);
        expect(attempt.failure).toBeInstanceOf(NoCallerSessionError);
        expect(post).not.toHaveBeenCalled();
    });
});

describe('selectHook — DL #50, canonical keys', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('should select a lower-case key for an upper-case request id', () => {
        const hook: SubmitHook = async () => {};
        expect(selectHook({ [FORM_ID]: hook }, FORM_ID.toUpperCase())).toBe(hook);
    });

    it('should select an upper-case key for a lower-case request id', () => {
        const hook: SubmitHook = async () => {};
        expect(selectHook({ [FORM_ID.toUpperCase()]: hook }, FORM_ID)).toBe(hook);
    });

    it('should warn once about a non-GUID key across two calls with the same hooks', () => {
        const hooks = { 'contact-us': async () => {} };

        selectHook(hooks, FORM_ID);
        selectHook(hooks, FORM_ID);

        expect(warn.mock.calls).toEqual([
            [
                '[wix-forms] submit hook key "contact-us" is not a form id and never matches; key hooks by the form\'s id',
            ],
        ]);
    });

    it('should not throw without hooks', () => {
        expect(() => selectHook(undefined, FORM_ID)).not.toThrow();
    });
});

/**
 * DL#53 G4 (P4): a hook rejects specific fields with `FieldRejection` before `submit()`.
 * Expected: `{ success: false, reason: VALIDATION, fieldErrors, code? }`. Before P4 the throw is a
 * plain Error, so it settles to the generic UNKNOWN failure (L5) and the field errors are lost.
 */
describe('runSubmission — DL#53 G4, FieldRejection', () => {
    it('should return VALIDATION with the field errors and the code when thrown before submit()', async () => {
        const { deps, posts } = harness({
            hook: async () => {
                throw new FieldRejection(
                    { phone: 'Please check the phone number.' },
                    { code: 'BAD_PHONE' },
                );
            },
        });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { phone: 'Please check the phone number.' },
            code: 'BAD_PHONE',
        });
        expect(posts).toEqual([]);
        expect(loggedMessages()).toEqual([]);
    });

    it('should omit the code when the rejection has none', async () => {
        const { deps } = harness({
            hook: async () => {
                throw new FieldRejection({ phone: 'Please check the phone number.' });
            },
        });

        const result = await submitWith(deps);
        expect(result).toEqual({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { phone: 'Please check the phone number.' },
        });
        expect('code' in result).toBe(false);
    });

    it('should keep the success when thrown after a successful submit(), and log it (L3)', async () => {
        const { deps, posts } = harness({
            hook: async ({ submit }) => {
                await submit();
                throw new FieldRejection({ phone: 'too late' });
            },
        });

        expect(await submitWith(deps)).toEqual({ success: true });
        expect(posts).toHaveLength(1);
        expect(loggedMessages()).toEqual([
            '[wix-forms] the submit hook threw after submit() was called',
        ]);
    });

    it('should treat an empty field map as an unexpected failure (UNKNOWN, L5)', async () => {
        const { deps } = harness({
            hook: async () => {
                throw new FieldRejection({}, { code: 'EMPTY' });
            },
        });

        expect(await submitWith(deps)).toEqual(UNKNOWN_FAILURE);
        expect(loggedMessages()).toEqual(['[wix-forms] the submit hook failed before submitting']);
    });

    it('should recognise a FieldRejection from a duplicate module instance by its name', async () => {
        const fromAnotherCopy = Object.assign(new Error('rejected'), {
            name: 'FieldRejection',
            fieldErrors: { email: 'Use your work email.' },
            options: { code: 'WORK_EMAIL' },
        });
        const { deps } = harness({
            hook: async () => {
                throw fromAnotherCopy;
            },
        });

        expect(await submitWith(deps)).toEqual({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { email: 'Use your work email.' },
            code: 'WORK_EMAIL',
        });
    });

    it('should export FieldRejection with its name, field errors and default options', () => {
        const rejection = new FieldRejection({ a: 'x', b: 'y' });
        expect(rejection).toBeInstanceOf(Error);
        expect(rejection.name).toBe('FieldRejection');
        expect(rejection.fieldErrors).toEqual({ a: 'x', b: 'y' });
        expect(rejection.options).toEqual({});
        expect(rejection.message).toBe('the submit hook rejected fields: a, b');
    });
});

/**
 * DL#53 H (P5, Q10 option (a)): an optional `honeypot` action input for direct / scripted posts.
 * Expected: with no hook a non-empty honeypot is dropped (fake success, no Wix call, info log);
 * with a hook, the hook gets `honeypot` (trimmed, '' when absent) and can return `{ dropped: true }`.
 * Before P5 the input is ignored, so a honeypot-filled post reaches Wix.
 */
describe('runSubmission — DL#53 H, server honeypot', () => {
    let info: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        info = vi.spyOn(console, 'info').mockImplementation(() => {});
    });

    afterEach(() => {
        info.mockRestore();
    });

    function postWithHoneypot(deps: SubmitDeps, honeypot: unknown) {
        return runSubmission(
            { formId: FORM_ID, values: { email_4b3a: 'a@b.co' }, honeypot } as never,
            deps,
        );
    }

    it('should drop a filled honeypot without a hook: fake success, no Wix call, info log', async () => {
        const { deps, posts, resolveClient } = harness();

        expect(await postWithHoneypot(deps, 'x')).toEqual({ success: true });
        expect(posts).toEqual([]);
        expect(resolveClient).not.toHaveBeenCalled();
        expect(info.mock.calls).toEqual([
            ['[wix-forms] dropped a submission (honeypot, no hook)', { formId: FORM_ID }],
        ]);
        expect(loggedMessages()).toEqual([]);
    });

    it.each([
        ['empty', ''],
        ['whitespace only', '   '],
        ['absent', undefined],
        ['not a string', 42],
    ])('should post as today without a hook when the honeypot is %s', async (_, honeypot) => {
        const { deps, posts } = harness();

        expect(await postWithHoneypot(deps, honeypot)).toEqual({ success: true });
        expect(posts).toEqual([[FORM_ID, { email_4b3a: 'a@b.co' }]]);
        expect(info).not.toHaveBeenCalled();
    });

    it.each([
        ['trimmed', '  x  ', 'x'],
        ["'' when absent", undefined, ''],
        ["'' when not a string", { a: 1 }, ''],
    ])('should pass the honeypot to the hook, %s', async (_, honeypot, expected) => {
        const seen: unknown[] = [];
        const { deps } = harness({
            hook: async (input) => {
                seen.push(input.honeypot);
                await input.submit();
            },
        });

        await postWithHoneypot(deps, honeypot);

        expect(seen).toEqual([expected]);
    });

    it('should not drop by default when a hook is registered: the hook decides', async () => {
        const { deps, posts } = harness({ hook: async ({ submit }) => submit() });

        expect(await postWithHoneypot(deps, 'x')).toEqual({ success: true });
        expect(posts).toHaveLength(1);
    });

    it('should settle a hook { dropped: true } without submit() as a success, logged at info, no L5', async () => {
        const { deps, posts } = harness({
            hook: async ({ honeypot }) => (honeypot ? { dropped: true } : undefined),
        });

        expect(await postWithHoneypot(deps, 'x')).toEqual({ success: true });
        expect(posts).toEqual([]);
        expect(info.mock.calls).toEqual([
            ['[wix-forms] dropped a submission (hook)', { formId: FORM_ID }],
        ]);
        expect(loggedMessages()).toEqual([]);
    });

    it('should honour redirectTo on a hook drop', async () => {
        const { deps } = harness({
            hook: async () => ({ dropped: true, redirectTo: '/thanks' }),
        });

        expect(await postWithHoneypot(deps, 'x')).toEqual({
            success: true,
            redirectTo: '/thanks',
        });
    });

    it('should keep the real success when dropped is returned after a successful submit(), logged L3', async () => {
        const { deps, posts } = harness({
            hook: async ({ submit }) => {
                await submit();
                return { dropped: true };
            },
        });

        expect(await postWithHoneypot(deps, 'x')).toEqual({ success: true });
        expect(posts).toHaveLength(1);
        expect(loggedMessages()).toEqual([
            '[wix-forms] the submit hook returned dropped after submit() was called',
        ]);
        expect(info).not.toHaveBeenCalled();
    });

    /** Regression guard: the honeypot is separate from `values` and never reaches Wix. */
    it('should never put the honeypot into the values posted to Wix, also with default submit() values', async () => {
        const { deps, posts } = harness({ hook: async ({ submit }) => submit() });

        await postWithHoneypot(deps, 'x');

        expect(posts).toEqual([[FORM_ID, { email_4b3a: 'a@b.co' }]]);
    });

    /** Regression guard: the allowlist runs first, so a drop reveals nothing about which ids exist. */
    it('should refuse a non-submittable id before dropping', async () => {
        const { deps, posts } = harness({ isSubmittableForm: async () => false });

        expect(await postWithHoneypot(deps, 'x')).toEqual({
            success: false,
            reason: SubmitFailure.REJECTED,
            message: SUBMIT_FAILED_MESSAGE,
        });
        expect(posts).toEqual([]);
        expect(info).not.toHaveBeenCalled();
    });
});

/**
 * Bug (DL#53 G3): a hook's `ActionError` code is dropped on the way to the page.
 * Found in: `lib/submission/run-submission.ts`, the ActionError settle row.
 * Expected: `{ success: false, reason: REJECTED, message, code: 'SLOT_TAKEN' }`.
 * Actual: `code` is missing, so the page cannot tell "slot taken" from any other rejection.
 */
describe('runSubmission — DL#53 G3, the hook code reaches the result', () => {
    it("should keep an ActionError's code in the REJECTED result", async () => {
        const { deps } = harness({
            hook: async () => {
                throw new ActionError('SLOT_TAKEN', 'That time was just booked.');
            },
        });

        const result = await submitWith(deps);

        expect(result).toEqual({
            success: false,
            reason: SubmitFailure.REJECTED,
            message: 'That time was just booked.',
            code: 'SLOT_TAKEN',
        });
    });

    /** Regression guard (green since P4): a FieldRejection's code reaches the result. */
    it("should keep a FieldRejection's code in the VALIDATION result", async () => {
        const { deps } = harness({
            hook: async () => {
                throw new FieldRejection({ phone: 'Check it.' }, { code: 'BAD_PHONE' });
            },
        });

        expect(await submitWith(deps)).toMatchObject({ code: 'BAD_PHONE' });
    });

    /** Regression guard: plugin and Wix failures carry no code (their reason is the code). */
    it('should carry no code for a Wix failure', async () => {
        const { deps } = harness({ wixFails: forbidden });

        expect('code' in (await submitWith(deps))).toBe(false);
    });
});
