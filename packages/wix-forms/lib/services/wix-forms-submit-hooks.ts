/**
 * Server-side submit hooks (DL#42 §Design 2), one per form. Replaces DL#41's augmenter.
 *
 * A project registers them inside `makeJayInit().withServer(...)`: a top-level
 * `registerService` in `src/init.ts` would ship the hooks to the browser.
 */

import { createJayService } from '@jay-framework/fullstack-component';
import type { VerifiedCaller } from '@jay-framework/wix-server-client';
import type { WixClient } from '@wix/sdk';
import type { FieldValue } from '../types.js';

export interface SubmitHookInput {
    formId: string;
    /** Values as sent by the browser, keyed by field target. UNTRUSTED: re-validate. */
    values: Record<string, FieldValue>;
    /** Verified with Wix; undefined = no proof. A VISITOR proves a browser session only. */
    caller: VerifiedCaller | undefined;
    /**
     * Caller-scoped Wix client (from the session cookie); undefined without an active session.
     * Supported: `client.use(module)`, `client.graphql` and `wixFetch(..., { authorization })` only;
     * `fetchWithAuth`/`fetch`/`enableContext` throw.
     */
    client: WixClient | undefined;
    /**
     * The `honeypot` action input, trimmed; the plugin always sets it ('' when absent). Optional in
     * the type only so hand-built inputs (e.g. a project's own hook unit tests) keep type-checking.
     * UNTRUSTED and advisory: the plugin's own component never sends it (its browser check drops
     * in-page bots before any request), so '' does NOT mean human. Non-empty means a direct post
     * filled it: drop with `{ dropped: true }`.
     */
    honeypot?: string;
    /**
     * Submit to Wix, at most once, before the hook settles. `values` replaces the submitted
     * values (default: `input.values`). Posts as the caller when the request has a session;
     * without a session cookie it is refused, unless `{ as: 'site' }` forces the site. Rejects
     * when Wix rejects, with `SessionExpiredError` when a caller post's session expired, with
     * `NoCallerSessionError` when the request has no session cookie, or with
     * `SubmitIgnoredError` when ignored. Await or return it.
     */
    submit(values?: Record<string, FieldValue>, options?: SubmitOptions): Promise<void>;
}

export interface SubmitOptions {
    /**
     * Default: the caller; refused without a session cookie. `'site'` posts with the site's
     * credentials for any caller, with or without a cookie.
     */
    as?: 'site';
}

export interface SubmitHookOutcome {
    /** Site path ('/…') to navigate to after success. */
    redirectTo?: string;
    /** Settle as a success without posting to Wix (e.g. a filled honeypot). Return it without calling submit(). */
    dropped?: true;
}

export type SubmitHook = (input: SubmitHookInput) => Promise<SubmitHookOutcome | void>;

/** formId → hook. */
export type SubmitHooks = Record<string, SubmitHook>;

export const WIX_FORMS_SUBMIT_HOOKS = createJayService<SubmitHooks>('WixFormsSubmitHooks');

/** The rejection of a `submit()` call that did not POST: a second call, or one after the hook settled. */
export class SubmitIgnoredError extends Error {
    constructor(formId: string) {
        super(`submit() was ignored for form "${formId}": it already ran, or the hook had settled`);
        this.name = 'SubmitIgnoredError';
    }
}

/** The rejection of a caller `submit()` whose session expired: nothing was posted (DL#43 Q5). */
export class SessionExpiredError extends Error {
    constructor(formId: string) {
        super(`submit() did not post form "${formId}": the caller's session expired`);
        this.name = 'SessionExpiredError';
    }
}

/**
 * The rejection of a caller `submit()` for a request without a session cookie: nothing was posted
 * (DL #50). Same name as wix-data's class on purpose; this one names the form.
 */
export class NoCallerSessionError extends Error {
    constructor(formId: string) {
        super(
            `submit() did not post form "${formId}": the request has no session cookie; use { as: 'site' } to post as the site`,
        );
        this.name = 'NoCallerSessionError';
    }
}

/**
 * Thrown by a hook, before `submit()`, to reject specific fields (DL#53 G4): field target → the
 * hook's own message. Settles to `{ success: false, reason: VALIDATION, fieldErrors, code? }`;
 * visible targets show on their field (`errorRule = SERVER`), others in `statusMessage`.
 * Recognised by `name`, so a duplicate module instance works. Thrown after a successful
 * `submit()`, the Wix outcome wins and the rejection is only logged.
 */
export class FieldRejection extends Error {
    constructor(
        readonly fieldErrors: Record<string, string>,
        readonly options: { code?: string } = {},
    ) {
        super('the submit hook rejected fields: ' + Object.keys(fieldErrors).join(', '));
        this.name = 'FieldRejection';
    }
}
