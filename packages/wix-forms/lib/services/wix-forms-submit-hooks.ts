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
    /** Wix client acting as the caller (from the session cookie); undefined without one. */
    client: WixClient | undefined;
    /**
     * Submit to Wix, at most once, before the hook settles. `values` replaces the submitted
     * values (default: `input.values`). Rejects when Wix rejects, or with `SubmitIgnoredError`
     * when ignored. Await or return it.
     */
    submit(values?: Record<string, FieldValue>): Promise<void>;
}

export interface SubmitHookOutcome {
    /** Site path ('/…') to navigate to after success. */
    redirectTo?: string;
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
