/**
 * Client-safe presentation of a submit result (DL#41 planned fix). Imported by the
 * browser component; must never import server-only modules.
 */

import type { FormFieldView } from '../types.js';
import { FieldRule } from './field-rule.js';
import { defaultFieldMessage } from '../utils/project-form-fields.js';

/** English default copy. Pages that need other words branch on `submitFailure` (DL#45). */
export const SUBMIT_FAILED_MESSAGE = 'We could not complete your request. Please try again.';
/** A caller post Wix refused for permissions, HTTP 403 (DL#43 §Review 2026-11-09). */
export const SUBMIT_NOT_ALLOWED_MESSAGE = 'Please sign in to submit this form.';
/** The caller's session cookie expired before the post (DL#43 Q5). */
export const SUBMIT_SESSION_EXPIRED_MESSAGE =
    'Your session expired. Please refresh the page and try again.';

/**
 * The `submitState` / `submitFailure` contract variants (DL#45). Member order IS the contract:
 * jay compiles `enum (A | B)` to a numeric enum, and the generator renders these members.
 */
export enum SubmitState {
    IDLE,
    SUBMITTING,
    SUCCEEDED,
    FAILED,
}

export enum SubmitFailure {
    NONE,
    VALIDATION,
    REJECTED,
    /**
     * Wix denied the caller (401 / 403), the caller's session expired, or the request had no
     * session cookie. Page copy must not assume sign-in.
     */
    PERMISSION,
    NETWORK,
    UNKNOWN,
}

/** The failure fields of a `SubmitFormResult` (structural: the base tsconfig is not strict). */
export interface SubmitRejection {
    success: boolean;
    reason?: SubmitFailure;
    message?: string;
    fieldErrors?: Record<string, string>;
    /** Server field errors the plugin classifies (DL#55); absent targets are `SERVER`. */
    fieldRules?: Record<string, FieldRule>;
    /** A hook's code (DL#53 G3), reported to page code through `onSubmitOutcome`. */
    code?: string;
}

export interface SubmitRejectionView {
    errorByTarget: Record<string, string>;
    invalidByTarget: Record<string, boolean>;
    ruleByTarget: Record<string, FieldRule>;
    statusMessage: string;
}

/**
 * Visible fields get their own error; a hidden field (no error tag) or an unknown target
 * is listed in the status message as `label || target: message`.
 */
export function presentSubmitRejection(
    result: SubmitRejection,
    fields: FormFieldView[],
): SubmitRejectionView {
    const view: SubmitRejectionView = {
        errorByTarget: {},
        invalidByTarget: {},
        ruleByTarget: {},
        statusMessage: '',
    };
    const statusLines: string[] = result.message ? [result.message] : [];
    for (const [target, message] of Object.entries(result.fieldErrors ?? {})) {
        const field = fields.find((candidate) => candidate.target === target);
        if (field && !field.hidden) {
            const rule = serverRuleOf(result, target);
            view.errorByTarget[target] = serverFieldMessage(rule, field, message);
            view.invalidByTarget[target] = true;
            view.ruleByTarget[target] = rule;
        } else {
            statusLines.push(`${field?.label || target}: ${message}`);
        }
    }
    view.statusMessage = statusLines.join(' ');
    if (!view.statusMessage && !Object.keys(view.errorByTarget).length) {
        view.statusMessage = SUBMIT_FAILED_MESSAGE;
    }
    return view;
}

/** The rule of a server field error (DL#55 P2). */
function serverRuleOf(result: SubmitRejection, target: string): FieldRule {
    return result.fieldRules?.[target] ?? FieldRule.SERVER;
}

/** A classified rule shows the plugin default (same text as the browser check); else Wix's text. */
function serverFieldMessage(rule: FieldRule, field: FormFieldView, wixText: string): string {
    if (rule === FieldRule.SERVER) return wixText;
    return defaultFieldMessage(rule, field) ?? wixText;
}

const PROBE_ORIGIN = 'https://site.invalid';

/** A same-site path ('/a?b#c') or undefined. Never throws. Idempotent. */
export function toSitePath(candidate: unknown): string | undefined {
    if (
        typeof candidate !== 'string' ||
        !candidate.startsWith('/') ||
        /[\u0000-\u001F\u007F\\]/.test(candidate)
    ) {
        return undefined;
    }
    try {
        const url = new URL(candidate, PROBE_ORIGIN);
        if (url.origin !== PROBE_ORIGIN) return undefined;
        const path = url.pathname + url.search + url.hash;
        return path.startsWith('//') ? undefined : path; // dot-segments can normalize to '//host'
    } catch {
        return undefined;
    }
}
