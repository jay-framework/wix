/**
 * Server-side submit orchestration (DL#39 planned fix, extended by DL#40 §Design 3).
 * Server-only: imported by `actions/forms-actions.ts` alone. It lives outside `actions/`
 * because the jay-stack compiler treats any import path containing `/actions/` or
 * `-actions` as an action module.
 *
 * Every outcome is RETURNED. Once the hook called `submit()`, the Wix outcome alone decides
 * the result, so a hook that swallows a Wix rejection and one that rethrows it agree.
 */

import {
    isExpiringSoon,
    isPermissionDenied,
    WixApiError,
    type RequestIdentity,
    type VerifiedCaller,
} from '@jay-framework/wix-server-client';
import type { WixClient } from '@wix/sdk';
import {
    SUBMIT_FAILED_MESSAGE,
    SUBMIT_NOT_ALLOWED_MESSAGE,
    SUBMIT_SESSION_EXPIRED_MESSAGE,
} from '../components/submit-outcome.js';
import {
    SessionExpiredError,
    SubmitIgnoredError,
    type SubmitHook,
    type SubmitHookOutcome,
    type SubmitHooks,
    type SubmitOptions,
} from '../services/wix-forms-submit-hooks.js';
import type { FieldValue, SubmitFormResult, SubmitRequestInput } from '../types.js';
import { parseSubmissionFieldErrors } from '../utils/project-form-fields.js';

type Values = Record<string, FieldValue>;

/** The request's caller session, as forms needs it to post (DL#41 §Design 2). */
export interface CallerSession {
    session: 'none' | 'active' | 'expired';
    authorization?: string;
    expiresAt?: number;
}

export interface SubmitDeps {
    /** `authorization` = the caller's access token; undefined posts with the site client. */
    createSubmission(formId: string, values: Values, authorization?: string): Promise<void>;
    /** Called only for a hooked form. */
    resolveIdentity(): Promise<{ caller: VerifiedCaller | undefined; client: WixClient | undefined }>;
    /** Called for every form; synchronous, no network. */
    resolveClient(): CallerSession;
    hook?: SubmitHook;
}

/** One request identity shared by both resolvers (DL#41 §Design 2, forms-actions). */
export function identitySubmitDeps(
    identity: RequestIdentity,
): Pick<SubmitDeps, 'resolveClient' | 'resolveIdentity'> {
    return {
        resolveClient: () => ({
            session: identity.session,
            authorization: identity.authorization,
            expiresAt: identity.expiresAt,
        }),
        resolveIdentity: async () => ({ caller: await identity.caller, client: identity.client }),
    };
}

const submitWithoutChanges: SubmitHook = ({ submit }) => submit();

export async function runSubmission(
    request: SubmitRequestInput,
    deps: SubmitDeps,
): Promise<SubmitFormResult> {
    const formId = request.formId ?? '';
    let callerSession: CallerSession;
    try {
        callerSession = deps.resolveClient();
        if (callerSession.session === 'active' && !callerSession.authorization) {
            throw new Error('an active session without an access token');
        }
    } catch (error) {
        logFailure('could not resolve the caller identity', formId, error); // L1
        return { success: false, message: SUBMIT_FAILED_MESSAGE };
    }
    let identity: Awaited<ReturnType<SubmitDeps['resolveIdentity']>> = {
        caller: undefined,
        client: undefined,
    };
    if (deps.hook) {
        try {
            identity = await deps.resolveIdentity();
        } catch (error) {
            logFailure('could not resolve the caller identity', formId, error); // L1
            return { success: false, message: SUBMIT_FAILED_MESSAGE };
        }
    }
    const attempt = createSubmitAttempt(formId, request.values, deps.createSubmission, callerSession);
    let outcome: SubmitHookOutcome | void = undefined;
    let thrown: unknown = undefined;
    try {
        outcome = await (deps.hook ?? submitWithoutChanges)({
            formId,
            values: request.values,
            ...identity,
            submit: attempt.submit,
        });
    } catch (error) {
        thrown = error ?? new Error('the submit hook threw an empty value');
    }
    attempt.sealed = true;
    await attempt.settled; // a submit() that started before the seal is awaited
    return settleSubmission(formId, attempt, thrown, outcome);
}

/** Own properties only: `formId` comes from the browser, so 'constructor' must not resolve. */
export function selectHook(hooks: SubmitHooks | undefined, formId: string): SubmitHook | undefined {
    return hooks && Object.hasOwn(hooks, formId) ? hooks[formId] : undefined;
}

export interface SubmitAttempt {
    state: 'idle' | 'pending' | 'succeeded' | 'failed';
    /** Set synchronously with state = 'pending'. 'site' when forced or when there is no session. */
    postedAs?: 'caller' | 'site';
    sealed: boolean;
    failure?: unknown;
    settled: Promise<void>;
    submit(values?: Values, options?: SubmitOptions): Promise<void>;
}

export function createSubmitAttempt(
    formId: string,
    requestValues: Values,
    createSubmission: SubmitDeps['createSubmission'],
    callerSession: CallerSession,
): SubmitAttempt {
    const attempt: SubmitAttempt = {
        state: 'idle',
        sealed: false,
        settled: Promise.resolve(),
        // Deliberately not `async`: the state check and change are synchronous, so
        // `Promise.all([submit(), submit()])` POSTs once.
        submit(values: Values = requestValues, options?: SubmitOptions): Promise<void> {
            if (attempt.sealed || attempt.state !== 'idle') {
                const ignored = new SubmitIgnoredError(formId);
                logFailure('submit() was ignored: it already ran, or the hook had settled', formId, ignored); // L2
                return handledRejection(ignored);
            }
            attempt.state = 'pending';
            const asCaller = options?.as !== 'site' && callerSession.session !== 'none';
            if (asCaller && isCallerSessionExpired(callerSession)) {
                attempt.state = 'failed';
                attempt.postedAs = 'caller';
                attempt.failure = new SessionExpiredError(formId);
                return handledRejection(attempt.failure);
            }
            const authorization = asCaller ? callerSession.authorization : undefined;
            attempt.postedAs = authorization ? 'caller' : 'site';
            const posting = createSubmission(formId, values, authorization).then(
                () => {
                    attempt.state = 'succeeded';
                },
                (error) => {
                    attempt.state = 'failed';
                    attempt.failure = error;
                    throw error;
                },
            );
            attempt.settled = posting.then(noop, noop); // also gives `posting` a handler
            return posting;
        },
    };
    return attempt;
}

function isCallerSessionExpired({ session, expiresAt }: CallerSession): boolean {
    return session === 'expired' || isExpiringSoon(expiresAt);
}

function handledRejection(error: unknown): Promise<never> {
    const rejection = Promise.reject(error);
    rejection.catch(noop);
    return rejection;
}

/** DL#40 §Design 3, the 5-row table: the first matching row wins. */
function settleSubmission(
    formId: string,
    attempt: SubmitAttempt,
    thrown: unknown,
    outcome: SubmitHookOutcome | void,
): SubmitFormResult {
    if (attempt.state !== 'idle' && thrown !== undefined && thrown !== attempt.failure) {
        logFailure('the submit hook threw after submit() was called', formId, thrown); // L3
    }
    if (attempt.state === 'succeeded') {
        const redirectTo = thrown === undefined ? (outcome || undefined)?.redirectTo : undefined;
        return redirectTo === undefined ? { success: true } : { success: true, redirectTo };
    }
    if (attempt.state === 'failed') {
        return failedSubmissionResult(formId, attempt);
    }
    if (isActionError(thrown)) {
        return { success: false, message: thrown.message };
    }
    if (thrown !== undefined) {
        logFailure('the submit hook failed before submitting', formId, thrown); // L5
    } else {
        logFailure('the submit hook returned without calling submit()', formId, undefined); // L5
    }
    return { success: false, message: SUBMIT_FAILED_MESSAGE };
}

/** The `failed` row (DL#41 §Design 2): reads the attempt's own failure, swallowed or rethrown. */
function failedSubmissionResult(formId: string, attempt: SubmitAttempt): SubmitFormResult {
    const failure = attempt.failure;
    if (failure instanceof SessionExpiredError) {
        return { success: false, message: SUBMIT_SESSION_EXPIRED_MESSAGE };
    }
    const fieldErrors = fieldErrorsOf(failure);
    if (Object.keys(fieldErrors).length) return { success: false, fieldErrors };
    if (attempt.postedAs === 'caller' && !isSiteTemplateRefusal(failure)) {
        logFailure("Wix refused the caller's submission", formId, failure); // L6, never retried as the site
        const message = isPermissionDenied(failure) ? SUBMIT_NOT_ALLOWED_MESSAGE : SUBMIT_FAILED_MESSAGE;
        return { success: false, message };
    }
    logFailure('Wix rejected the submission', formId, failure); // L4
    return { success: false, message: SUBMIT_FAILED_MESSAGE };
}

/** 428 SITE_IS_A_TEMPLATE is about the site, not the caller: the generic L4 path (DL#41 Q4). */
function isSiteTemplateRefusal(error: unknown): boolean {
    if (!(error instanceof WixApiError) || error.status !== 428) return false;
    try {
        return JSON.parse(error.responseBody)?.details?.applicationError?.code === 'SITE_IS_A_TEMPLATE';
    } catch {
        return false;
    }
}

function fieldErrorsOf(error: unknown): Record<string, string> {
    return error instanceof WixApiError ? parseSubmissionFieldErrors(error.responseBody) : {};
}

/** Recognised as jay's ActionRegistry does, so it survives duplicate module instances. */
function isActionError(error: unknown): error is Error {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { name?: unknown }).name === 'ActionError'
    );
}

/** Logs `name: message` only: never the cookie, the tokens, or the submitted values. */
function logFailure(what: string, formId: string, error: unknown): void {
    const details: { formId: string; error?: string } = { formId };
    if (error !== undefined) details.error = describeError(error);
    console.error(`[wix-forms] ${what}`, details);
}

function describeError(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function noop(): void {}
