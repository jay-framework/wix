/**
 * Client-side Wix Forms context (DL#53 G1, G3): the channel through which page code gives the
 * plugin's form component its own field rules ("page checks") and learns of each settled submit
 * (`onSubmitOutcome`).
 *
 * Created once by `provideWixFormsContext()` in the plugin's client init. Page code reads it
 * with `.withContexts(WIX_FORMS_CONTEXT)` / `useContext`; the form component reads it at call
 * time with `useGlobalContext`, so without client init no page checks run and nothing throws.
 *
 * ```typescript
 * const forms = useContext(WIX_FORMS_CONTEXT);
 * const unregister = forms.registerFieldChecks(BOOKING_FORM_ID, {
 *     guests: [(value) => (Number(value) <= 8 ? undefined : 'Up to 8 guests per booking')],
 * });
 * // The context outlives the page: subscribe in an effect so unmount unsubscribes.
 * createEffect(() =>
 *     forms.onSubmitOutcome(({ event }) => {
 *         if (event.formId !== BOOKING_FORM_ID || event.outcome !== 'failed') return;
 *         if (event.code === 'SLOT_TAKEN') reloadSlots();
 *     }),
 * );
 * ```
 *
 * Page checks are browser UX only, not a security check: the server re-validates in a hook.
 */

import { createJayContext } from '@jay-framework/runtime';
import { registerReactiveGlobalContext } from '@jay-framework/component';
import type { SubmitFailure } from '../components/submit-outcome.js';
import type { FieldValue } from '../types.js';
import { canonicalFormId } from '../utils/form-id.js';

/** A page's own rule. Return a message to fail (the page's own wording), nothing to pass. */
export type FieldCheck = (
    value: FieldValue,
    values: Readonly<Record<string, FieldValue>>,
) => string | undefined;

/** Field target → checks, run in order after the Wix rules pass; the first message wins. */
export type FieldChecks = Record<string, FieldCheck[]>;

/**
 * One settled submit, as the visitor was shown it — never what was stored. A honeypot trip and a
 * server-side drop both read `succeeded`; neither this event nor the confirmation is a persistence
 * guarantee. `formId` is canonical; a page with two forms filters on it.
 */
export type SubmitOutcomeEvent =
    | { formId: string; outcome: 'succeeded'; redirectTo?: string }
    | {
          formId: string;
          outcome: 'failed';
          reason: SubmitFailure;
          /** A hook's `ActionError` / `FieldRejection` code; absent for plugin and Wix failures. */
          code?: string;
          fieldErrors?: Record<string, string>;
          /** True when `fieldErrors` come from the submit hook's `FieldRejection` (DL #57 H). */
          fromHook?: boolean;
      };

/** jay's event-handler shape: the event arrives as `{ event }`. */
export type SubmitOutcomeHandler = (args: { event: SubmitOutcomeEvent }) => void;

/** A submit the form handed to the server (DL #57 G6). `formId` is canonical. */
export interface SubmitStartEvent {
    formId: string;
}

export type SubmitStartHandler = (args: { event: SubmitStartEvent }) => void;

export interface WixFormsContext {
    /** Register checks for one form (keyed by form id, any case); returns an unregister function. */
    registerFieldChecks(formId: string, checks: FieldChecks): () => void;
    /**
     * Fires once per settled submit of any plugin form (DL#53 G3). Returns an unsubscribe function:
     * the context is global and jay never removes a handler, so call it when the page unmounts.
     */
    onSubmitOutcome(handler: SubmitOutcomeHandler): () => void;
    /**
     * Fires once per submit handed to the server, before the request (DL #57 G6). Not for a busy
     * click, a honeypot trip, a client-validation stop, or a reset before hand-off.
     * Usually followed by one onSubmitOutcome for the same form; not when the form is reset or the
     * page unloads meanwhile (no 'abandoned' outcome). Some outcomes have no start (a client-
     * validation stop, a honeypot trip): keep a per-form "started" flag, set here, and act on an
     * outcome only when it is set. Display needs no code: bind submitState (SUBMITTING = handed off).
     * Returns an unsubscribe function: subscribe inside createEffect and return it.
     */
    onSubmitStart(handler: SubmitStartHandler): () => void;
}

export const WIX_FORMS_CONTEXT = createJayContext<WixFormsContext>('wix:forms');

/**
 * The component's read side, kept off the public interface. A symbol key, because jay's
 * context proxy reads every accessed member and throws on one that does not exist.
 */
const REGISTERED_CHECKS = Symbol('wix-forms.registeredFieldChecks');
/** The component's emit side; through the context, `onSubmitOutcome` only subscribes. */
const EMIT_SUBMIT_OUTCOME = Symbol('wix-forms.emitSubmitOutcome');
/** The component's emit side for `onSubmitStart` (DL #57 G6). */
const EMIT_SUBMIT_START = Symbol('wix-forms.emitSubmitStart');

interface WixFormsContextState extends WixFormsContext {
    [REGISTERED_CHECKS](formId: string): FieldChecks[];
    [EMIT_SUBMIT_OUTCOME](event: SubmitOutcomeEvent): void;
    [EMIT_SUBMIT_START](event: SubmitStartEvent): void;
}

/** Called once from init.ts `.withClient`; registerReactiveGlobalContext, as wix-cart. */
export function provideWixFormsContext(): WixFormsContext {
    return registerReactiveGlobalContext(WIX_FORMS_CONTEXT, createWixFormsContextState);
}

/** Every registration for `formId` (canonicalised), in registration order. */
export function registeredFieldChecks(context: WixFormsContext, formId: string): FieldChecks[] {
    const canonical = canonicalFormId(formId);
    return canonical ? (context as WixFormsContextState)[REGISTERED_CHECKS](canonical) : [];
}

/** Emits one settled submit to every `onSubmitOutcome` subscriber. */
export function emitSubmitOutcome(context: WixFormsContext, event: SubmitOutcomeEvent): void {
    (context as WixFormsContextState)[EMIT_SUBMIT_OUTCOME](event);
}

/** Emits one submit hand-off to every `onSubmitStart` subscriber (DL #57 G6). */
export function emitSubmitStart(context: WixFormsContext, event: SubmitStartEvent): void {
    (context as WixFormsContextState)[EMIT_SUBMIT_START](event);
}

function createWixFormsContextState(): WixFormsContextState {
    const registrationsByFormId = new Map<string, FieldChecks[]>();
    const keysWarnedAbout = new Set<string>();

    function registerFieldChecks(formId: string, checks: FieldChecks): () => void {
        const canonical = canonicalFormId(formId);
        if (!canonical) {
            warnAboutNonFormIdKey(formId);
            return () => {};
        }
        registrationsByFormId.set(canonical, [...registrationsFor(canonical), checks]);
        return () => {
            registrationsByFormId.set(
                canonical,
                registrationsFor(canonical).filter((registered) => registered !== checks),
            );
        };
    }

    function registrationsFor(canonical: string): FieldChecks[] {
        return registrationsByFormId.get(canonical) ?? [];
    }

    /** Checks are registered in TypeScript at runtime, so no validator sees them: warn once. */
    function warnAboutNonFormIdKey(key: string): void {
        if (keysWarnedAbout.has(key)) return;
        keysWarnedAbout.add(key);
        console.warn(
            `[wix-forms] field checks key "${key}" is not a form id and never matches; key checks by the form's id`,
        );
    }

    const submitOutcomeHandlers = new Set<SubmitOutcomeHandler>();
    function onSubmitOutcome(handler: SubmitOutcomeHandler): () => void {
        submitOutcomeHandlers.add(handler);
        return () => submitOutcomeHandlers.delete(handler);
    }

    const submitStartHandlers = new Set<SubmitStartHandler>();
    function onSubmitStart(handler: SubmitStartHandler): () => void {
        submitStartHandlers.add(handler);
        return () => submitStartHandlers.delete(handler);
    }

    return {
        registerFieldChecks,
        onSubmitOutcome,
        onSubmitStart,
        [REGISTERED_CHECKS]: registrationsFor,
        [EMIT_SUBMIT_OUTCOME]: (event) =>
            callEachHandler(submitOutcomeHandlers, event, 'onSubmitOutcome'),
        [EMIT_SUBMIT_START]: (event) =>
            callEachHandler(submitStartHandlers, event, 'onSubmitStart'),
    };
}

/**
 * Calls every handler with `{ event }`, each in its own `try` (DL #57 L1): a throwing page handler is
 * logged and never skips the others. A snapshot, so a handler that unsubscribes while being called
 * does not skip the next one.
 */
function callEachHandler<E extends { formId: string }>(
    handlers: Set<(args: { event: E }) => void>,
    event: E,
    eventName: string,
): void {
    for (const handler of [...handlers]) {
        try {
            handler({ event });
        } catch (error) {
            console.error(`[wix-forms] an ${eventName} handler threw`, {
                formId: event.formId,
                error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            });
        }
    }
}
