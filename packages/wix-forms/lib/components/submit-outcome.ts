/**
 * Client-safe presentation of a submit result (DL#39 planned fix). Imported by the
 * browser component; must never import server-only modules.
 */

import type { FormFieldView } from '../types.js';

export const SUBMIT_FAILED_MESSAGE = 'We could not complete your request. Please try again.';

/** The failure fields of a `SubmitFormResult` (structural: the base tsconfig is not strict). */
export interface SubmitRejection {
    success: boolean;
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
    const statusLines: string[] = [];
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
