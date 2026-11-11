// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ submit: undefined as undefined | (() => Promise<void>) }));

vi.mock('../lib/actions/forms-actions.js', () => ({
    submitForm: vi.fn(async () => ({ success: true })),
    getFormSummary: vi.fn(),
}));
vi.mock('@jay-framework/wix-server-client/client', () => ({
    ensureSessionFresh: vi.fn(async () => undefined),
}));
// Pass-through that also keeps the component's `submit`, so a test can await it directly.
vi.mock('../lib/components/form-submit-guard.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/components/form-submit-guard.js')>();
    return {
        guardNativeFormSubmit: (form: HTMLFormElement, submit: () => Promise<void>) => {
            captured.submit = submit;
            actual.guardNativeFormSubmit(form, submit);
        },
    };
});

import { clearGlobalContextRegistry } from '@jay-framework/runtime';
import { submitForm } from '../lib/actions/forms-actions.js';
import { SubmitFailure } from '../lib/components/submit-outcome.js';
import { provideWixFormsContext } from '../lib/contexts/wix-forms-context.js';
import type { FormFieldView } from '../lib/types.js';
import {
    fakeInput,
    listenerFor,
    mountWixForm,
    type FakeFieldElements,
    type FakeInput,
    type WixFormHarness,
} from './support/wix-form-harness.js';

const FORM_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const requiredName: FormFieldView = {
    target: 'name',
    label: 'Name',
    inputType: 'text',
    required: true,
    placeholder: '',
    options: [],
};

const optionalEmail: FormFieldView = {
    target: 'email',
    label: 'Email',
    inputType: 'email',
    required: false,
    placeholder: '',
    options: [],
};

/** Lets every pending microtask and the reactive's `setTimeout(0)` auto-batch flush run. */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 10));
}

async function mount(
    fields: FormFieldView[],
    fieldElements: Record<string, FakeFieldElements> = {},
): Promise<WixFormHarness> {
    const harness = mountWixForm(fields, undefined, fieldElements, FORM_ID);
    await settle();
    return harness;
}

async function submitOnce(): Promise<void> {
    if (!captured.submit) throw new Error('the native form guard was never installed');
    await captured.submit();
    await settle();
}

function type(input: FakeInput, value: string): void {
    input.value = value;
    listenerFor(input, 'input')({ target: input });
}

beforeEach(() => {
    captured.submit = undefined;
    vi.mocked(submitForm).mockReset();
    vi.mocked(submitForm).mockResolvedValue({ success: true });
});

afterEach(() => {
    clearGlobalContextRegistry();
    vi.unstubAllGlobals();
});

describe('wixForm — DL#53 H, the in-page honeypot', () => {
    /** Regression guard (DL#41 Q12, DL#42 demo): a trip shows the confirmation and never posts. */
    it('should show the confirmation without a submitForm call when the honeypot is filled', async () => {
        const harness = await mount([optionalEmail], { email: { input: fakeInput() } });
        type(harness.honeypot, 'i am a bot');

        await submitOnce();

        expect(submitForm).not.toHaveBeenCalled();
        expect(harness.viewState().isSubmitted).toBe(true);
    });
});

/** Subscribes to `onSubmitOutcome` on a freshly provided context; returns the events seen. */
function recordOutcomes(): unknown[] {
    const events: unknown[] = [];
    const forms = provideWixFormsContext() as any;
    // jay's EventEmitter calls each handler with `{ event }`.
    forms.onSubmitOutcome(({ event }: { event: unknown }) => void events.push(event));
    return events;
}

/**
 * DL#53 G3 (P6): page code learns of each settled submit through
 * `WIX_FORMS_CONTEXT.onSubmitOutcome`. Before P6 the context has no such member, so page code
 * cannot observe an outcome (or a hook's code) at all.
 */
describe('wixForm — DL#53 G3, onSubmitOutcome', () => {
    it('should emit succeeded once for a successful submit', async () => {
        const events = recordOutcomes();
        await mount([optionalEmail], { email: { input: fakeInput() } });

        await submitOnce();

        expect(events).toEqual([{ formId: FORM_ID, outcome: 'succeeded' }]);
    });

    it('should emit succeeded with the redirect path when the result redirects', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({ success: true, redirectTo: '/thanks' });
        const assign = vi.fn();
        vi.stubGlobal('window', {
            location: { assign },
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
        const events = recordOutcomes();
        await mount([optionalEmail], { email: { input: fakeInput() } });

        await submitOnce();

        expect(events).toEqual([{ formId: FORM_ID, outcome: 'succeeded', redirectTo: '/thanks' }]);
        expect(assign).toHaveBeenCalledWith('/thanks');
    });

    it('should emit a VALIDATION failure with the client field errors', async () => {
        const events = recordOutcomes();
        await mount([requiredName], { name: { input: fakeInput() } });

        await submitOnce();

        expect(submitForm).not.toHaveBeenCalled();
        expect(events).toEqual([
            {
                formId: FORM_ID,
                outcome: 'failed',
                reason: SubmitFailure.VALIDATION,
                fieldErrors: { name: 'Name is required.' },
            },
        ]);
    });

    it("should emit a REJECTED failure with the hook's code", async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.REJECTED,
            message: 'That time was just booked.',
            code: 'SLOT_TAKEN',
        } as any);
        const events = recordOutcomes();
        await mount([optionalEmail], { email: { input: fakeInput() } });

        await submitOnce();

        expect(events).toEqual([
            {
                formId: FORM_ID,
                outcome: 'failed',
                reason: SubmitFailure.REJECTED,
                code: 'SLOT_TAKEN',
            },
        ]);
    });

    it('should emit a server VALIDATION failure with its field errors and code', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { email: 'Use your work email.' },
            code: 'WORK_EMAIL',
        } as any);
        const events = recordOutcomes();
        await mount([optionalEmail], { email: { input: fakeInput() } });

        await submitOnce();

        expect(events).toEqual([
            {
                formId: FORM_ID,
                outcome: 'failed',
                reason: SubmitFailure.VALIDATION,
                code: 'WORK_EMAIL',
                fieldErrors: { email: 'Use your work email.' },
            },
        ]);
    });

    it('should emit a NETWORK failure when the request fails', async () => {
        vi.mocked(submitForm).mockRejectedValueOnce(new Error('offline'));
        const events = recordOutcomes();
        await mount([optionalEmail], { email: { input: fakeInput() } });

        await submitOnce();

        expect(events).toEqual([
            { formId: FORM_ID, outcome: 'failed', reason: SubmitFailure.NETWORK },
        ]);
    });

    it('should emit succeeded for a honeypot trip, indistinguishable from a real success', async () => {
        const events = recordOutcomes();
        const harness = await mount([optionalEmail], { email: { input: fakeInput() } });
        type(harness.honeypot, 'i am a bot');

        await submitOnce();

        expect(events).toEqual([{ formId: FORM_ID, outcome: 'succeeded' }]);
    });

    it('should report the canonical form id', async () => {
        const events = recordOutcomes();
        mountWixForm(
            [optionalEmail],
            undefined,
            { email: { input: fakeInput() } },
            FORM_ID.toUpperCase(),
        );
        await settle();

        await submitOnce();

        expect(events).toEqual([{ formId: FORM_ID, outcome: 'succeeded' }]);
    });

    /** Regression guard (Q8): without the plugin's client init there is no event and no throw. */
    it('should submit without throwing when no context is registered', async () => {
        const harness = await mount([optionalEmail], { email: { input: fakeInput() } });

        await expect(submitOnce()).resolves.toBeUndefined();

        expect(submitForm).toHaveBeenCalledTimes(1);
        expect(harness.viewState().isSubmitted).toBe(true);
    });
});

/**
 * DL#53 §6 (P7): on a redirect the confirmation is not shown before navigating.
 * Expected: navigate with `isSubmitted` false, no confirmation focus, `isSubmitting` still true.
 * Before P7 `presentSubmitResult` calls `showSubmitted()` first, so the confirmation flashes.
 */
describe('wixForm — DL#53 P7, no confirmation before a redirect', () => {
    function stubNavigation(): ReturnType<typeof vi.fn> {
        const assign = vi.fn();
        vi.stubGlobal('window', {
            location: { assign },
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
        return assign;
    }

    it('should navigate without showing or focusing the confirmation, staying busy', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({ success: true, redirectTo: '/thanks' });
        const assign = stubNavigation();
        const harness = await mount([optionalEmail], { email: { input: fakeInput() } });

        await submitOnce();

        expect(assign).toHaveBeenCalledWith('/thanks');
        expect(harness.viewState().isSubmitted).toBe(false);
        expect(harness.viewState().isSubmitting).toBe(true);
        expect(harness.confirmation.focus).not.toHaveBeenCalled();
    });

    /** Regression guard: an unsafe redirect is dropped and the confirmation shows as today. */
    it('should still show the confirmation when the redirect is unsafe', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: true,
            redirectTo: 'https://evil.example',
        });
        const assign = stubNavigation();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const harness = await mount([optionalEmail], { email: { input: fakeInput() } });

        await submitOnce();

        expect(assign).not.toHaveBeenCalled();
        expect(harness.viewState().isSubmitted).toBe(true);
        expect(harness.viewState().isSubmitting).toBe(false);
        errors.mockRestore();
    });
});
