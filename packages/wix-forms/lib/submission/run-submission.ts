/**
 * Server-side submit orchestration (DL#41 planned fix). Server-only: imported by
 * `actions/forms-actions.ts` alone. It lives outside `actions/` because the jay-stack
 * compiler treats any import path containing `/actions/` or `-actions` as an action module.
 */

import { WixApiError } from '@jay-framework/wix-server-client';
import type { FieldValue, SubmitFormResult, SubmitRequestInput } from '../types.js';
import { parseSubmissionFieldErrors } from '../utils/project-form-fields.js';

export interface SubmitDeps {
    createSubmission(formId: string, values: Record<string, FieldValue>): Promise<void>;
}

export async function runSubmission(
    request: SubmitRequestInput,
    deps: SubmitDeps,
): Promise<SubmitFormResult> {
    try {
        await deps.createSubmission(request.formId ?? '', request.values);
        return { success: true };
    } catch (error) {
        const fieldErrors = fieldErrorsOf(error);
        if (Object.keys(fieldErrors).length) {
            return { success: false, fieldErrors };
        }
        throw error;
    }
}

function fieldErrorsOf(error: unknown): Record<string, string> {
    return error instanceof WixApiError ? parseSubmissionFieldErrors(error.responseBody) : {};
}
