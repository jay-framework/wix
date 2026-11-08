// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createSubmitFlight } from '../lib/components/form-submit-flight.js';
import {
    runFormSubmit,
    type RunFormSubmitParams,
} from '../lib/components/form-submit-execution.js';

type TestDeps = RunFormSubmitParams & { flight: ReturnType<typeof createSubmitFlight> };

function deps(overrides: Partial<RunFormSubmitParams> = {}): TestDeps {
    let submitting = false;
    const flight = createSubmitFlight();
    const ensureSessionFresh = vi.fn(async () => undefined);
    const submitForm = vi.fn(async () => ({ success: true as const }));
    const navigate = vi.fn();
    const onNetworkFailure = vi.fn();
    const presentSubmitResult = vi.fn(() => undefined as string | undefined);

    return {
        flight,
        isSubmitting: () => submitting,
        setIsSubmitting: (value: boolean) => {
            submitting = value;
        },
        formId: 'form-1',
        submissionValues: { email: 'a@b.c' },
        ensureSessionFresh,
        submitForm,
        presentSubmitResult,
        navigate,
        onNetworkFailure,
        ...overrides,
    };
}

describe('runFormSubmit', () => {
    it('should not call submitForm when a submit is already in flight', async () => {
        const submitForm = vi.fn(async () => ({ success: true as const }));
        const d = deps({ isSubmitting: () => true, submitForm });
        await runFormSubmit(d);
        expect(submitForm).not.toHaveBeenCalled();
    });

    it('should call ensureSessionFresh before submitForm', async () => {
        const ensureSessionFresh = vi.fn(async () => undefined);
        const submitForm = vi.fn(async () => ({ success: true as const }));
        const d = deps({ ensureSessionFresh, submitForm });
        await runFormSubmit(d);
        expect(ensureSessionFresh).toHaveBeenCalled();
        expect(submitForm).toHaveBeenCalled();
        expect(ensureSessionFresh.mock.invocationCallOrder[0]).toBeLessThan(
            submitForm.mock.invocationCallOrder[0],
        );
    });

    it('should surface a network failure and re-enable the button', async () => {
        const submitForm = vi.fn(async () => {
            throw new Error('offline');
        });
        const onNetworkFailure = vi.fn();
        const d = deps({ submitForm, onNetworkFailure });
        await runFormSubmit(d);
        expect(onNetworkFailure).toHaveBeenCalled();
        expect(d.isSubmitting()).toBe(false);
    });

    it('should navigate on success and leave the button disabled', async () => {
        const presentSubmitResult = vi.fn(() => '/thanks');
        const navigate = vi.fn();
        const d = deps({ presentSubmitResult, navigate });
        await runFormSubmit(d);
        expect(navigate).toHaveBeenCalledWith('/thanks');
        expect(d.isSubmitting()).toBe(true);
    });

    it('should not navigate when presentSubmitResult returns no path and should re-enable the button', async () => {
        const presentSubmitResult = vi.fn(() => undefined);
        const navigate = vi.fn();
        const d = deps({ presentSubmitResult, navigate });
        await runFormSubmit(d);
        expect(navigate).not.toHaveBeenCalled();
        expect(d.isSubmitting()).toBe(false);
    });

    it('should not apply a stale result after flight.invalidate', async () => {
        const resolvers: Array<(value: { success: true }) => void> = [];
        const submitForm = vi.fn(
            () =>
                new Promise<{ success: true }>((resolve) => {
                    resolvers.push(resolve);
                }),
        );
        const presentSubmitResult = vi.fn(() => undefined);
        const d = deps({ submitForm, presentSubmitResult });
        const inFlight = runFormSubmit(d);
        await Promise.resolve();
        d.flight.invalidate();
        resolvers[0]({ success: true });
        await inFlight;
        expect(presentSubmitResult).not.toHaveBeenCalled();
        expect(d.isSubmitting()).toBe(true);
    });

    it('should keep a newer submit in flight when an older response is stale', async () => {
        const resolvers: Array<(value: { success: true }) => void> = [];
        const submitForm = vi.fn(
            () =>
                new Promise<{ success: true }>((resolve) => {
                    resolvers.push(resolve);
                }),
        );
        const presentSubmitResult = vi.fn(() => undefined);
        const d = deps({ submitForm, presentSubmitResult });

        const first = runFormSubmit(d);
        await Promise.resolve();
        d.flight.invalidate();
        d.setIsSubmitting(false);

        const second = runFormSubmit(d);
        await Promise.resolve();
        expect(submitForm).toHaveBeenCalledTimes(2);
        expect(d.isSubmitting()).toBe(true);

        resolvers[0]({ success: true });
        await first;
        expect(presentSubmitResult).not.toHaveBeenCalled();
        expect(d.isSubmitting()).toBe(true);

        const blocker = vi.fn(async () => ({ success: true as const }));
        await runFormSubmit({ ...d, submitForm: blocker });
        expect(blocker).not.toHaveBeenCalled();

        resolvers[1]({ success: true });
        await second;
    });
});
