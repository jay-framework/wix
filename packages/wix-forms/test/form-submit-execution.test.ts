// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createSubmitFlight } from '../lib/components/form-submit-flight.js';
import {
    runFormSubmit,
    type RunFormSubmitParams,
} from '../lib/components/form-submit-execution.js';

type TestDeps = RunFormSubmitParams & { flight: ReturnType<typeof createSubmitFlight> };

type FlagTestDeps = TestDeps & { isSubmitting: () => boolean };

/** The component has already set the busy flag and begun the flight (DL#53 G2). */
function deps(overrides: Partial<RunFormSubmitParams> = {}): FlagTestDeps {
    let submitting = true;
    const flight = createSubmitFlight();
    const generation = flight.begin();
    const ensureSessionFresh = vi.fn(async () => undefined);
    const submitForm = vi.fn(async () => ({ success: true as const }));
    const navigate = vi.fn();
    const onNetworkFailure = vi.fn();
    const presentSubmitResult = vi.fn(() => undefined as string | undefined);

    return {
        flight,
        generation,
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
    it('should not apply the result when the given generation is no longer current', async () => {
        const presentSubmitResult = vi.fn(() => undefined);
        const d = deps({ presentSubmitResult });
        d.flight.begin();
        await runFormSubmit(d);
        expect(presentSubmitResult).not.toHaveBeenCalled();
    });

    it('should leave the busy flag to the component while the request is pending', async () => {
        let submitting = false;
        const d = deps({ setIsSubmitting: (value) => void (submitting = value) });
        const presentSubmitResult = vi.fn(() => '/thanks');
        await runFormSubmit({ ...d, presentSubmitResult });
        expect(submitting).toBe(false);
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

        d.setIsSubmitting(true);
        const second = runFormSubmit({ ...d, generation: d.flight.begin() });
        await Promise.resolve();
        expect(submitForm).toHaveBeenCalledTimes(2);

        resolvers[0]({ success: true });
        await first;
        expect(presentSubmitResult).not.toHaveBeenCalled();
        expect(d.isSubmitting()).toBe(true);

        resolvers[1]({ success: true });
        await second;
    });
});
