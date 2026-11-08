import type { FieldValue, SubmitFormResult } from '../types.js';
import type { SubmitFlight } from './form-submit-flight.js';

export interface RunFormSubmitParams {
    flight: SubmitFlight;
    isSubmitting: () => boolean;
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
 * the component so the path is unit-testable without a DOM harness.
 */
export async function runFormSubmit(params: RunFormSubmitParams): Promise<void> {
    if (params.isSubmitting()) return;

    const generation = params.flight.begin();
    params.setIsSubmitting(true);

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
