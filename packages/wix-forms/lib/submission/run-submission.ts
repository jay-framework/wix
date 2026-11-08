/**
 * Server-side submit orchestration (DL#41 planned fix, extended by DL#42 §Design 3).
 * Server-only: imported by `actions/forms-actions.ts` alone. It lives outside `actions/`
 * because the jay-stack compiler treats any import path containing `/actions/` or
 * `-actions` as an action module.
 *
 * Every outcome is RETURNED. Once the hook called `submit()`, the Wix outcome alone decides
 * the result, so a hook that swallows a Wix rejection and one that rethrows it agree.
 */

import { WixApiError, type VerifiedCaller } from '@jay-framework/wix-server-client';
import type { WixClient } from '@wix/sdk';
import { SUBMIT_FAILED_MESSAGE, SubmitFailure } from '../components/submit-outcome.js';
import {
    SubmitIgnoredError,
    type SubmitHook,
    type SubmitHookOutcome,
    type SubmitHooks,
} from '../services/wix-forms-submit-hooks.js';
import type { FieldValue, SubmitFormResult, SubmitRequestInput } from '../types.js';
import { parseSubmissionFieldErrors } from '../utils/project-form-fields.js';

type Values = Record<string, FieldValue>;

export interface SubmitDeps {
    createSubmission(formId: string, values: Values): Promise<void>;
    /** Called only for a hooked form. */
    resolveIdentity(): Promise<{
        caller: VerifiedCaller | undefined;
        client: WixClient | undefined;
    }>;
    hook?: SubmitHook;
}

const submitWithoutChanges: SubmitHook = ({ submit }) => submit();

export async function runSubmission(
    request: SubmitRequestInput,
    deps: SubmitDeps,
): Promise<SubmitFormResult> {
    const formId = request.formId ?? '';
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
    const attempt = createSubmitAttempt(formId, request.values, deps.createSubmission);
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

interface SubmitAttempt {
    state: 'idle' | 'pending' | 'succeeded' | 'failed';
    sealed: boolean;
    failure?: unknown;
    settled: Promise<void>;
    submit(values?: Values): Promise<void>;
}

function createSubmitAttempt(
    formId: string,
    requestValues: Values,
    createSubmission: SubmitDeps['createSubmission'],
): SubmitAttempt {
    const attempt: SubmitAttempt = {
        state: 'idle',
        sealed: false,
        settled: Promise.resolve(),
        // Deliberately not `async`: the state check and change are synchronous, so
        // `Promise.all([submit(), submit()])` POSTs once.
        submit(values: Values = requestValues): Promise<void> {
            if (attempt.sealed || attempt.state !== 'idle') {
                const ignored = new SubmitIgnoredError(formId);
                logFailure(
                    'submit() was ignored: it already ran, or the hook had settled',
                    formId,
                    ignored,
                ); // L2
                const rejection = Promise.reject(ignored);
                rejection.catch(noop);
                return rejection;
            }
            attempt.state = 'pending';
            const posting = createSubmission(formId, values).then(
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
        const fieldErrors = fieldErrorsOf(attempt.failure);
        if (Object.keys(fieldErrors).length) {
            return { success: false, reason: SubmitFailure.VALIDATION, fieldErrors };
        }
        logFailure('Wix rejected the submission', formId, attempt.failure); // L4
        return genericFailure(wixFailureReason(attempt.failure));
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
