import type { FieldValue, SubmitFormResult } from '../types.js';
import type { SubmitFlight } from './form-submit-flight.js';

export interface RunFormSubmitParams {
    flight: SubmitFlight;
    /** The generation the component began with its busy flag (DL#53 G2). */
    generation: number;
    setIsSubmitting: (value: boolean) => void;
    ensureSessionFresh: () => Promise<void>;
    submitForm: (input: {
        formId: string;
        values: Record<string, FieldValue>;
    }) => Promise<SubmitFormResult>;
    formId: string;
    submissionValues: Record<string, FieldValue>;
    presentSubmitResult: (result: SubmitFormResult) => string | undefined;
    navigate: (path: string) => void;
    onNetworkFailure: () => void;
}

/**
 * Client submit orchestration (session refresh, action call, redirect). Kept separate from
 * the component so the path is unit-testable without a DOM harness. The component owns the
 * busy flag and the flight generation (DL#53 G2); this clears the flag on a transport failure
 * and when there is no redirect.
 */
export async function runFormSubmit(params: RunFormSubmitParams): Promise<void> {
    const { generation } = params;
    let result: SubmitFormResult;
    try {
        await params.ensureSessionFresh();
        result = await params.submitForm({
            formId: params.formId,
            values: params.submissionValues,
        });
    } catch {
        if (!params.flight.isCurrent(generation)) return;
        params.onNetworkFailure();
        params.setIsSubmitting(false);
        return;
    }

    if (!params.flight.isCurrent(generation)) return;

    const redirectPath = params.presentSubmitResult(result);
    if (redirectPath) {
        params.navigate(redirectPath);
    } else {
        params.setIsSubmitting(false);
    }
}
