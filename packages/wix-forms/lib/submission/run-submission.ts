/**
 * Server-side submit orchestration (DL#41 planned fix, extended by DL#42 §Design 3).
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
    SubmitFailure,
} from '../components/submit-outcome.js';
import {
    NoCallerSessionError,
    SessionExpiredError,
    SubmitIgnoredError,
    type SubmitHook,
    type SubmitHookOutcome,
    type SubmitHooks,
    type SubmitOptions,
} from '../services/wix-forms-submit-hooks.js';
import type { FieldValue, SubmitFormResult, SubmitRequestInput } from '../types.js';
import { canonicalFormId } from '../utils/form-id.js';
import { parseSubmissionFieldErrors } from '../utils/project-form-fields.js';

type Values = Record<string, FieldValue>;

/** The request's caller session, as forms needs it to post (DL#43 §Design 2). */
export interface CallerSession {
    session: 'none' | 'active' | 'expired';
    authorization?: string;
    expiresAt?: number;
}

export interface SubmitDeps {
    /** `authorization` = the caller's access token; undefined posts with the site client. */
    createSubmission(formId: string, values: Values, authorization?: string): Promise<void>;
    /** Called only for a hooked form. */
    resolveIdentity(): Promise<{
        caller: VerifiedCaller | undefined;
        client: WixClient | undefined;
    }>;
    /** Called for every form; synchronous, no network. */
    resolveClient(): CallerSession;
    /** The submit allowlist (DL #50 §1), for a canonical id; rejects when it cannot load. */
    isSubmittableForm(formId: string): Promise<boolean>;
    hook?: SubmitHook;
}

/** One request identity shared by both resolvers (DL#43 §Design 2, forms-actions). */
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
    const formId = canonicalFormId(request.formId);
    if (!formId) {
        logFailure(NOT_SUBMITTABLE, NOT_A_FORM_ID, undefined); // L7
        return genericFailure(SubmitFailure.REJECTED);
    }
    const refusal = await allowlistRefusal(formId, deps);
    if (refusal) return refusal;
    return submitSubmittableForm(formId, request.values, deps);
}

const NOT_SUBMITTABLE = 'refused a submission for a form that is not submittable';
const NOT_A_FORM_ID = '<not a form id>';

/**
 * Runs before the hook and identity (DL #50 §2): registering a hook does not make a form
 * submittable. A refusal has the shape of Wix's 404 for a nonexistent form.
 */
async function allowlistRefusal(
    formId: string,
    deps: SubmitDeps,
): Promise<SubmitFormResult | undefined> {
    try {
        if (await deps.isSubmittableForm(formId)) return undefined;
    } catch (error) {
        logFailure('could not load the submittable forms', formId, error); // L8
        return genericFailure(SubmitFailure.UNKNOWN);
    }
    logFailure(NOT_SUBMITTABLE, formId, undefined); // L7
    return genericFailure(SubmitFailure.REJECTED);
}

async function submitSubmittableForm(
    formId: string,
    values: Values,
    deps: SubmitDeps,
): Promise<SubmitFormResult> {
    let callerSession: CallerSession;
    try {
        callerSession = deps.resolveClient();
        if (callerSession.session === 'active' && !callerSession.authorization) {
            throw new Error('an active session without an access token');
        }
    } catch (error) {
        logFailure('could not resolve the caller identity', formId, error); // L1
        return genericFailure(SubmitFailure.UNKNOWN);
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
            return genericFailure(SubmitFailure.UNKNOWN);
        }
    }
    const attempt = createSubmitAttempt(formId, values, deps.createSubmission, callerSession);
    let outcome: SubmitHookOutcome | void = undefined;
    let thrown: unknown = undefined;
    try {
        outcome = await (deps.hook ?? submitWithoutChanges)({
            formId,
            values,
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

/**
 * Compares canonical ids, so a key matches the form id in any case (DL #50 F4). `Object.keys`
 * lists own properties only: `formId` comes from the browser, so 'constructor' must not resolve.
 * The first key in `Object.keys` order wins when two keys canonicalise to the same id.
 */
export function selectHook(
    hooks: SubmitHooks | undefined,
    rawFormId: string,
): SubmitHook | undefined {
    if (!hooks) return undefined;
    warnAboutNonFormIdKeys(hooks);
    const formId = canonicalFormId(rawFormId);
    if (!formId) return undefined;
    const key = Object.keys(hooks).find((candidate) => canonicalFormId(candidate) === formId);
    return key === undefined ? undefined : hooks[key];
}

const hooksWarnedAbout = new WeakSet<SubmitHooks>();

/** Hooks are registered in TypeScript at runtime, so no validator sees them: warn once instead (Q10). */
function warnAboutNonFormIdKeys(hooks: SubmitHooks): void {
    if (hooksWarnedAbout.has(hooks)) return;
    hooksWarnedAbout.add(hooks);
    for (const key of Object.keys(hooks)) {
        if (canonicalFormId(key)) continue;
        console.warn(
            `[wix-forms] submit hook key "${key}" is not a form id and never matches; key hooks by the form's id`,
        );
    }
}

export interface SubmitAttempt {
    state: 'idle' | 'pending' | 'succeeded' | 'failed';
    /** Set synchronously with state = 'pending'. 'site' only when forced with `{ as: 'site' }`. */
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
                logFailure(
                    'submit() was ignored: it already ran, or the hook had settled',
                    formId,
                    ignored,
                ); // L2
                return handledRejection(ignored);
            }
            attempt.state = 'pending';
            const asCaller = options?.as !== 'site';
            if (asCaller && callerSession.session === 'none') {
                return failAttempt(attempt, new NoCallerSessionError(formId));
            }
            if (asCaller && isCallerSessionExpired(callerSession)) {
                return failAttempt(attempt, new SessionExpiredError(formId));
            }
            // An 'active' session always has `authorization` (checked in submitSubmittableForm).
            const authorization = asCaller ? callerSession.authorization : undefined;
            attempt.postedAs = asCaller ? 'caller' : 'site';
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

/** A caller post refused before posting: the attempt is consumed, so no `{ as: 'site' }` retry. */
function failAttempt(attempt: SubmitAttempt, failure: Error): Promise<never> {
    attempt.state = 'failed';
    attempt.postedAs = 'caller';
    attempt.failure = failure;
    return handledRejection(failure);
}

function isCallerSessionExpired({ session, expiresAt }: CallerSession): boolean {
    return session === 'expired' || isExpiringSoon(expiresAt);
}

function handledRejection(error: unknown): Promise<never> {
    const rejection = Promise.reject(error);
    rejection.catch(noop);
    return rejection;
}

/** DL#42 §Design 3, the 5-row table: the first matching row wins. */
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
        return { success: false, reason: SubmitFailure.REJECTED, message: thrown.message };
    }
    if (thrown !== undefined) {
        logFailure('the submit hook failed before submitting', formId, thrown); // L5
    } else {
        logFailure('the submit hook returned without calling submit()', formId, undefined); // L5
    }
    return genericFailure(SubmitFailure.UNKNOWN);
}

function genericFailure(reason: SubmitFailure): SubmitFormResult {
    return { success: false, reason, message: SUBMIT_FAILED_MESSAGE };
}

/** A failure that is not a `WixApiError` never got an answer from Wix. */
function wixFailureReason(error: unknown): SubmitFailure {
    if (!(error instanceof WixApiError)) return SubmitFailure.UNKNOWN;
    return error.status === 401 || error.status === 403
        ? SubmitFailure.PERMISSION
        : SubmitFailure.REJECTED;
}

/** The `failed` row (DL#43 §Design 2): reads the attempt's own failure, swallowed or rethrown. */
function failedSubmissionResult(formId: string, attempt: SubmitAttempt): SubmitFormResult {
    const failure = attempt.failure;
    if (failure instanceof NoCallerSessionError) {
        logFailure('refused a submission without a session cookie', formId, undefined); // L9
        return genericFailure(SubmitFailure.PERMISSION);
    }
    if (failure instanceof SessionExpiredError) {
        // An expired session: the page can ask the user to refresh.
        return {
            success: false,
            reason: SubmitFailure.PERMISSION,
            message: SUBMIT_SESSION_EXPIRED_MESSAGE,
        };
    }
    const fieldErrors = fieldErrorsOf(failure);
    if (Object.keys(fieldErrors).length) {
        return { success: false, reason: SubmitFailure.VALIDATION, fieldErrors };
    }
    if (attempt.postedAs === 'caller' && !isSiteTemplateRefusal(failure)) {
        logFailure("Wix refused the caller's submission", formId, failure); // L6, never retried as the site
        if (isPermissionDenied(failure)) {
            return {
                success: false,
                reason: SubmitFailure.PERMISSION,
                message: SUBMIT_NOT_ALLOWED_MESSAGE,
            };
        }
        return genericFailure(wixFailureReason(failure));
    }
    logFailure('Wix rejected the submission', formId, failure); // L4
    return genericFailure(wixFailureReason(failure));
}

/** 428 SITE_IS_A_TEMPLATE is about the site, not the caller: the generic L4 path (DL#43 Q4). */
function isSiteTemplateRefusal(error: unknown): boolean {
    if (!(error instanceof WixApiError) || error.status !== 428) return false;
    try {
        return (
            JSON.parse(error.responseBody)?.details?.applicationError?.code === 'SITE_IS_A_TEMPLATE'
        );
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
