/**
 * Client-safe presentation of a submit result (DL#41 planned fix). Imported by the
 * browser component; must never import server-only modules.
 */

import type { FormFieldView } from '../types.js';

export const SUBMIT_FAILED_MESSAGE = 'We could not complete your request. Please try again.';

/** The failure fields of a `SubmitFormResult` (structural: the base tsconfig is not strict). */
export interface SubmitRejection {
    success: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
}

export interface SubmitRejectionView {
    errorByTarget: Record<string, string>;
    invalidByTarget: Record<string, boolean>;
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
    const view: SubmitRejectionView = { errorByTarget: {}, invalidByTarget: {}, statusMessage: '' };
    const statusLines: string[] = result.message ? [result.message] : [];
    for (const [target, message] of Object.entries(result.fieldErrors ?? {})) {
        const field = fields.find((candidate) => candidate.target === target);
        if (field && !field.hidden) {
            view.errorByTarget[target] = message;
            view.invalidByTarget[target] = true;
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
