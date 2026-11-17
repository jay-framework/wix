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
import { BLUR_ANNOUNCE_DELAY_MS } from '../lib/components/blur-announcer.js';
import { SubmitFailure } from '../lib/components/submit-outcome.js';
import { provideWixFormsContext } from '../lib/contexts/wix-forms-context.js';
import type { FormFieldView } from '../lib/types.js';
import {
    fakeControl,
    fakeInput,
    listenerFor,
    mountWixForm,
    optionalTextField,
    type FakeFieldElements,
    type FakeInput,
    type WixFormHarness,
} from './support/wix-form-harness.js';

/** Lets every pending microtask and the reactive's `setTimeout(0)` auto-batch flush run. */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 10));
}

const requiredEmail: FormFieldView = {
    target: 'email',
    label: 'Email',
    inputType: 'email',
    required: true,
    placeholder: '',
    options: [],
};

const countrySelect: FormFieldView = {
    target: 'country',
    label: 'Country',
    inputType: 'select',
    required: false,
    placeholder: '',
    options: [
        { value: 'uk', label: 'UK' },
        { value: 'fr', label: 'France' },
    ],
};

const consentCheckbox: FormFieldView = {
    target: 'consent',
    label: 'Consent',
    inputType: 'checkbox',
    required: false,
    placeholder: '',
    options: [],
};

const topicsMultiselect: FormFieldView = {
    target: 'topics',
    label: 'Topics',
    inputType: 'multiselect',
    required: false,
    placeholder: '',
    options: [{ value: 'a', label: 'A' }],
};

/** A native `<select>` without `<option value="">`: the DOM shows its first option. */
function fakeSelect(): FakeInput {
    return { ...fakeInput(), value: 'uk' };
}

async function mount(
    fields: FormFieldView[],
    fieldElements: Record<string, FakeFieldElements>,
): Promise<WixFormHarness> {
    const harness = mountWixForm(fields, undefined, fieldElements);
    await settle();
    return harness;
}

function submitNow(): Promise<void> {
    if (!captured.submit) throw new Error('the native form guard was never installed');
    return captured.submit();
}

async function submitOnce(): Promise<void> {
    await submitNow();
    await settle();
}

function resetNow(harness: WixFormHarness): void {
    listenerFor(harness.resetButton, 'click')({ preventDefault: vi.fn() });
}

function blur(input: FakeInput): void {
    listenerFor(input, 'blur')({});
}

function type(input: FakeInput, value: string): void {
    input.value = value;
    listenerFor(input, 'input')({ target: input });
}

function postedValues(call = 0): Record<string, unknown> {
    return vi.mocked(submitForm).mock.calls[call][0].values;
}

function errorOf(harness: WixFormHarness, target: string): string {
    return harness.viewState()[target].error;
}

beforeEach(() => {
    captured.submit = undefined;
    vi.mocked(submitForm).mockReset();
    vi.mocked(submitForm).mockResolvedValue({ success: true });
});

/**
 * Bug: blur flags untouched fields and typing hides a still-invalid state (DL#53 G2).
 * Found in: design-log/53 §Problem G2 — `onblur` always validates, `oninput` always clears.
 * Expected: blur validates only dirty or errored fields; typing clears only once valid.
 * Actual: tabbing past an empty required field shows its error; any keystroke clears it.
 */
describe('wix-form validation timing (DL#53 G2)', () => {
    it('should not show an error when an untouched empty required field is blurred', async () => {
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });

        blur(input);
        await settle();

        expect(errorOf(harness, 'email')).toBe('');
    });

    it('should validate on blur after the user typed', async () => {
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });

        type(input, 'not-an-email');
        blur(input);
        await settle();

        expect(errorOf(harness, 'email')).not.toBe('');
    });

    it('should clear the error once the typed value is valid', async () => {
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        await submitOnce();

        type(input, 'ada@example.com');
        await settle();

        expect(errorOf(harness, 'email')).toBe('');
    });

    it('should keep the existing message unchanged while the typed value is still invalid', async () => {
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        await submitOnce();
        const requiredMessage = errorOf(harness, 'email');

        type(input, 'a');
        await settle();

        expect(requiredMessage).not.toBe('');
        expect(errorOf(harness, 'email')).toBe(requiredMessage);
    });
});

/**
 * Bug: a browser that autofills without an `input` event submits empty values (DL#53 G2).
 * Found in: design-log/53 §Problem G2 — the submit path reads the store, never the DOM.
 * Expected: at submit, text-like inputs and a changed single select are reconciled from the DOM.
 * Actual: the store's empty value is posted although the user sees the filled input.
 */
describe('wix-form autofill reconcile (DL#53 G2)', () => {
    it('should submit a text value the browser filled without an input event', async () => {
        const input = fakeInput();
        await mount([optionalTextField], { name: { input } });

        input.value = 'Ada';
        await submitOnce();

        expect(postedValues()).toEqual({ name: 'Ada' });
    });

    it('should submit a select value the browser changed without an event and mark it dirty', async () => {
        const select = fakeSelect();
        const control = fakeControl('uk');
        await mount([countrySelect], { country: { input: select, control } });

        select.value = 'fr';
        control.setAttribute('data-value', 'uk');
        await submitOnce();

        // Dirty: its control no longer overrides it at the seed.
        expect(postedValues()).toEqual({ country: 'fr' });
    });

    it('should mark nothing dirty when an untouched form is submitted', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({ success: false, message: 'No.' } as any);
        const nameInput = fakeInput();
        const nameControl = fakeControl('Ada');
        await mount([optionalTextField, countrySelect], {
            name: { input: nameInput, control: nameControl },
            country: { input: fakeSelect() },
        });

        await submitOnce();
        nameControl.setAttribute('data-value', 'Grace');
        await submitOnce();

        expect(postedValues(0)).toEqual({ name: 'Ada', country: '' });
        expect(postedValues(1)).toEqual({ name: 'Grace', country: '' });
    });

    it('should post an empty value for an untouched select after reset', async () => {
        const select = fakeSelect();
        const harness = await mount([countrySelect], { country: { input: select } });

        await submitOnce();
        resetNow(harness);
        await settle();
        await submitOnce();

        expect(postedValues(1)).toEqual({ country: '' });
    });

    it('should not read a checkbox or multiselect DOM change that fired no event', async () => {
        const checkbox = { ...fakeInput(), checked: true };
        const multiselect = { ...fakeInput(), selectedOptions: [{ value: 'a' }], options: [] };
        await mount([consentCheckbox, topicsMultiselect], {
            consent: { input: checkbox },
            topics: { input: multiselect },
        });

        await submitOnce();

        expect(postedValues()).toEqual({ consent: false, topics: [] });
    });

    it('should reconcile before seeding so a filled field is not overwritten by its control', async () => {
        const input = fakeInput();
        const control = fakeControl('Ada');
        await mount([optionalTextField], { name: { input, control } });

        input.value = 'Bob';
        control.setAttribute('data-value', 'Cy');
        await submitOnce();

        expect(postedValues()).toEqual({ name: 'Bob' });
        expect(input.value).toBe('Bob');
    });

    it('should post a control-set value for a field that binds no native input', async () => {
        const control = fakeControl('');
        await mount([optionalTextField], { name: { control } });

        control.setAttribute('data-value', 'Widget');
        listenerFor(control, 'input')({ target: control });
        await submitOnce();

        expect(postedValues()).toEqual({ name: 'Widget' });
    });
});

/**
 * Bug: the busy flag is set only after the pre-submit awaits (DL#53 G2, hardening).
 * Found in: design-log/53 §2 — `isSubmitting` is set inside `runFormSubmit`, after the seed;
 *   a reset during that window lets the old call post and show success on the reset form.
 * Expected: busy from the first click; one validation; a reset cancels the pending submit.
 * Actual: the flag is false until hand-off; a second call re-validates; reset does not cancel.
 */
describe('wix-form submit flight (DL#53 G2)', () => {
    it('should be submitting synchronously after submit starts, before the first await', async () => {
        const harness = await mount([optionalTextField], { name: { input: fakeInput() } });
        const sendButton = { closest: () => null };

        listenerFor(harness.submitButton, 'click')({ target: sendButton, preventDefault: vi.fn() });

        expect(harness.viewState().isSubmitting).toBe(true);
        await settle();
    });

    it('should validate and focus only once when an invalid form is submitted twice', async () => {
        const input = fakeInput();
        await mount([requiredEmail], { email: { input } });

        void submitNow();
        void submitNow();
        await settle();

        expect(input.focus).toHaveBeenCalledTimes(1);
    });

    it('should call submitForm exactly once on a double submit', async () => {
        await mount([optionalTextField], { name: { input: fakeInput() } });

        void submitNow();
        void submitNow();
        await settle();

        expect(submitForm).toHaveBeenCalledTimes(1);
    });

    it('should not submit when the form is reset while the pre-submit seed is pending', async () => {
        const harness = await mount([optionalTextField], { name: { input: fakeInput() } });

        const pending = submitNow();
        resetNow(harness);
        await pending;
        await settle();

        expect(submitForm).not.toHaveBeenCalled();
        expect(harness.viewState().isSubmitted).toBe(false);
        expect(harness.viewState().isSubmitting).toBe(false);
        expect(errorOf(harness, 'name')).toBe('');
    });

    it('should release the busy flag when the seed throws', async () => {
        const control = fakeControl('s-1');
        const harness = await mount([optionalTextField], { name: { control } });
        control.getAttribute = () => {
            throw new Error('page widget broke');
        };

        await expect(submitNow()).rejects.toThrow('page widget broke');
        await settle();

        expect(harness.viewState().isSubmitting).toBe(false);
        expect(submitForm).not.toHaveBeenCalled();
    });

    it('should clear the busy flag after a client-validation failure', async () => {
        const harness = await mount([requiredEmail], { email: { input: fakeInput() } });

        await submitOnce();

        expect(harness.viewState().isSubmitting).toBe(false);
    });
});

const requiredName: FormFieldView = { ...optionalTextField, required: true };
const requiredTopics: FormFieldView = { ...topicsMultiselect, required: true };
const PAGE_CHECK_FORM_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

/** A promise the test settles by hand, to hold a submit in flight. */
function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((settle) => (resolve = settle));
    return { promise, resolve };
}

/**
 * Bug: a blur-found error is written only to the per-field live region at the moment focus moves
 * to the next field, so VoiceOver drops it (DL #59 §Problem).
 * Found in: design-log/59 — human VoiceOver listen on a consumer site.
 * Expected: statusMessage is cleared now and holds the error one task later; fixing clears it;
 * typing, commits, submit, reset, the confirmation and teardown never leave a blur text behind.
 * Actual: statusMessage stays '' outside a submit.
 */
describe('wix-form blur announcement through statusMessage (DL #59)', () => {
    /** Flushes jay's reactive `setTimeout(0)` batch and pending microtasks under fake timers. */
    const flush = () => vi.advanceTimersByTimeAsync(0);
    /** Runs the announcer's deferred write ("advance" in DL #59). */
    const advance = () => vi.advanceTimersByTimeAsync(BLUR_ANNOUNCE_DELAY_MS);

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        clearGlobalContextRegistry();
    });

    async function mountForm(
        fields: FormFieldView[],
        fieldElements: Record<string, FakeFieldElements>,
        options: { chipField?: FormFieldView; formId?: string } = {},
    ): Promise<WixFormHarness> {
        const harness = mountWixForm(fields, options.chipField, fieldElements, options.formId);
        await flush();
        return harness;
    }

    async function submitAndSettle(): Promise<void> {
        const submitting = submitNow();
        await flush();
        await submitting;
        await flush();
    }

    function status(harness: WixFormHarness): string {
        return harness.viewState().statusMessage;
    }

    /** Types then empties the field, so it is dirty and fails REQUIRED on blur. */
    function makeDirtyAndEmpty(input: FakeInput): void {
        type(input, 'a');
        type(input, '');
    }

    async function announceRequiredEmail(): Promise<{ harness: WixFormHarness; input: FakeInput }> {
        const input = fakeInput();
        const harness = await mountForm([requiredEmail], { email: { input } });
        makeDirtyAndEmpty(input);
        blur(input);
        await advance();
        return { harness, input };
    }

    it('should announce a blur-found error in statusMessage on the next macrotask', async () => {
        const input = fakeInput();
        const harness = await mountForm([requiredEmail], { email: { input } });
        makeDirtyAndEmpty(input);

        blur(input);
        expect(status(harness)).toBe('');

        await advance();
        expect(errorOf(harness, 'email')).not.toBe('');
        expect(status(harness)).toBe(errorOf(harness, 'email'));
    });

    it('should clear statusMessage before re-announcing the same error on a second invalid leave', async () => {
        const { harness, input } = await announceRequiredEmail();
        const message = errorOf(harness, 'email');
        expect(status(harness)).toBe(message);

        blur(input);
        expect(status(harness)).toBe('');

        await advance();
        expect(status(harness)).toBe(message);
    });

    it('should not announce while typing', async () => {
        const { harness, input } = await announceRequiredEmail();
        const before = status(harness);

        type(input, 'not-an-email');
        await advance();

        expect(status(harness)).toBe(before);
    });

    it('should silently clear the field announcement when the field is fixed by typing', async () => {
        const { harness, input } = await announceRequiredEmail();
        expect(status(harness)).toBe(errorOf(harness, 'email'));

        type(input, 'ada@example.com');
        expect(status(harness)).toBe('');
        await advance();
        expect(status(harness)).toBe('');
    });

    it('should silently clear when the field is left valid on blur', async () => {
        const { harness, input } = await announceRequiredEmail();
        expect(status(harness)).toBe(errorOf(harness, 'email'));

        type(input, 'ada@example.com');
        blur(input);
        await advance();

        expect(status(harness)).toBe('');
    });

    it('should cancel a pending announcement when the field is fixed before the delay', async () => {
        const input = fakeInput();
        const harness = await mountForm([requiredEmail], { email: { input } });
        makeDirtyAndEmpty(input);

        blur(input);
        type(input, 'ada@example.com');
        await advance();

        expect(status(harness)).toBe('');
    });

    it('should not clear another owner message on withdraw', async () => {
        const email = fakeInput();
        const name = fakeInput();
        const harness = await mountForm([requiredEmail, requiredName], {
            email: { input: email },
            name: { input: name },
        });
        makeDirtyAndEmpty(email);
        blur(email);
        await advance();
        expect(status(harness)).toBe(errorOf(harness, 'email'));

        type(email, 'ada@example.com');
        expect(status(harness)).toBe('');

        type(name, 'Ada');
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.REJECTED,
            message: 'Server says no',
            fieldErrors: { name: 'Taken' },
        } as any);
        await submitAndSettle();
        expect(status(harness)).toBe('Server says no');

        type(name, 'Ada Lovelace');
        type(email, 'ada@example.org');
        await advance();
        expect(errorOf(harness, 'name')).toBe('');
        expect(status(harness)).toBe('Server says no');
    });

    it('should let submit win over a pending blur announcement', async () => {
        const input = fakeInput();
        const harness = await mountForm([requiredEmail], { email: { input } });
        makeDirtyAndEmpty(input);

        blur(input);
        await submitAndSettle();
        await advance();

        expect(harness.viewState().submitFailure).toBe(SubmitFailure.VALIDATION);
        expect(status(harness)).toBe('');
    });

    it('should cancel a pending announcement on reset', async () => {
        const input = fakeInput();
        const harness = await mountForm([requiredEmail], { email: { input } });
        makeDirtyAndEmpty(input);

        blur(input);
        resetNow(harness);
        await advance();

        expect(status(harness)).toBe('');
    });

    it('should not announce a blur on an untouched field', async () => {
        const input = fakeInput();
        const harness = await mountForm([requiredEmail], { email: { input } });

        blur(input);
        await advance();

        expect(status(harness)).toBe('');
    });

    it('should announce only the last of two rapid invalid leaves', async () => {
        const email = fakeInput();
        const name = fakeInput();
        const harness = await mountForm([requiredEmail, requiredName], {
            email: { input: email },
            name: { input: name },
        });
        type(email, 'not-an-email');
        makeDirtyAndEmpty(name);

        blur(email);
        blur(name);
        await advance();

        expect(errorOf(harness, 'email')).not.toBe(errorOf(harness, 'name'));
        expect(status(harness)).toBe(errorOf(harness, 'name'));
    });

    it('should not announce on control commit or chip toggle', async () => {
        const control = fakeControl('');
        const harness = await mountForm([requiredName, requiredTopics], { name: { control } }, {
            chipField: requiredTopics,
        });

        listenerFor(control, 'input')({ target: control });
        harness.chips[0].checked = true;
        listenerFor(harness.chips[0], 'change')({ target: harness.chips[0] });
        harness.chips[0].checked = false;
        listenerFor(harness.chips[0], 'change')({ target: harness.chips[0] });
        await advance();

        expect(errorOf(harness, 'name')).not.toBe('');
        expect(errorOf(harness, 'topics')).not.toBe('');
        expect(status(harness)).toBe('');
    });

    it('should not leave a blur announcement behind on a client-validation stop', async () => {
        const { harness } = await announceRequiredEmail();
        expect(status(harness)).toBe(errorOf(harness, 'email'));

        await submitAndSettle();
        expect(status(harness)).toBe('');
        await advance();
        expect(status(harness)).toBe('');
    });

    it('should not announce a blur that happens during an in-flight submit', async () => {
        const input = fakeInput();
        const harness = await mountForm([requiredEmail], { email: { input } });
        type(input, 'ada@example.com');
        const flight = deferred<any>();
        vi.mocked(submitForm).mockReturnValueOnce(flight.promise);

        const submitting = submitNow();
        await flush();
        type(input, 'not-an-email');
        blur(input);
        await advance();
        expect(errorOf(harness, 'email')).not.toBe('');
        expect(status(harness)).toBe('');

        flight.resolve({ success: true });
        await submitting;
        await flush();
        expect(status(harness)).toBe('');
    });

    it('should not leave a blur announcement next to the success confirmation', async () => {
        const { harness, input } = await announceRequiredEmail();
        expect(status(harness)).toBe(errorOf(harness, 'email'));

        type(input, 'ada@example.com');
        await submitAndSettle();
        expect(harness.viewState().isSubmitted).toBe(true);
        expect(status(harness)).toBe('');

        blur(input);
        await advance();
        expect(status(harness)).toBe('');
    });

    describe("the plugin's own focus move after an Enter-key submit", () => {
        const laterDate: FormFieldView = { ...optionalTextField, target: 'date', label: 'Date' };

        async function mountWithFocusBlurringB(checkB: ReturnType<typeof vi.fn>) {
            provideWixFormsContext().registerFieldChecks(PAGE_CHECK_FORM_ID, { date: [checkB] });
            const inputA = fakeInput();
            const inputB = fakeInput();
            inputA.focus.mockImplementation(() => blur(inputB));
            const harness = await mountForm(
                [requiredEmail, laterDate],
                { email: { input: inputA }, date: { input: inputB } },
                { formId: PAGE_CHECK_FORM_ID },
            );
            type(inputB, 'yesterday');
            return { harness, inputA, inputB };
        }

        it('should not announce the blur caused by focusing the first invalid field', async () => {
            const checkB = vi.fn(() => 'Pick a later date');
            const { harness, inputA } = await mountWithFocusBlurringB(checkB);
            const callsBefore = checkB.mock.calls.length;

            await submitAndSettle();
            expect(inputA.focus).toHaveBeenCalled();
            expect(checkB.mock.calls.length - callsBefore).toBe(2);

            await advance();
            expect(status(harness)).toBe('');
        });

        it('should keep the rejection text when the rejection focus move blurs an invalid field', async () => {
            const checkB = vi.fn<() => string | undefined>(() => 'Pick a later date');
            checkB.mockReturnValueOnce(undefined);
            const { harness, inputA } = await mountWithFocusBlurringB(checkB);
            type(inputA, 'ada@example.com');
            vi.mocked(submitForm).mockResolvedValueOnce({
                success: false,
                reason: SubmitFailure.REJECTED,
                message: 'Server says no',
                fieldErrors: { email: 'Taken' },
            } as any);

            await submitAndSettle();
            expect(inputA.focus).toHaveBeenCalled();
            expect(errorOf(harness, 'date')).toBe('Pick a later date');

            await advance();
            expect(status(harness)).toBe('Server says no');
        });
    });

    it('should cancel a pending announcement on pagehide', async () => {
        const addEventListener = vi.fn();
        vi.stubGlobal('window', {
            addEventListener,
            removeEventListener: vi.fn(),
            location: { assign: vi.fn() },
        });
        const input = fakeInput();
        const harness = await mountForm([requiredEmail], { email: { input } });
        const pagehide = addEventListener.mock.calls.find(([name]) => name === 'pagehide');
        expect(pagehide).toBeDefined();
        makeDirtyAndEmpty(input);

        blur(input);
        pagehide![1]({ persisted: true });
        await advance();

        expect(status(harness)).toBe('');
    });

    it('should cancel a pending announcement when the component unmounts', async () => {
        const input = fakeInput();
        const harness = await mountForm([requiredEmail], { email: { input } });
        makeDirtyAndEmpty(input);
        blur(input);
        const pendingTimers = vi.getTimerCount();

        harness.unmount();

        expect(pendingTimers).toBeGreaterThan(0);
        expect(vi.getTimerCount()).toBe(0);
        await advance();
        expect(status(harness)).toBe('');
    });

    it('should not announce the removal blur after a honeypot fake success', async () => {
        const input = fakeInput();
        const harness = await mountForm([requiredEmail], { email: { input } });
        type(input, 'not-an-email');
        type(harness.honeypot, 'bot');

        await submitAndSettle();
        expect(harness.viewState().isSubmitted).toBe(true);
        blur(input);
        await advance();

        expect(status(harness)).toBe('');
    });

    it('should not announce an invalid edit typed during a successful submit when the form is removed', async () => {
        const input = fakeInput();
        const harness = await mountForm([requiredEmail], { email: { input } });
        type(input, 'ada@example.com');
        const flight = deferred<any>();
        vi.mocked(submitForm).mockReturnValueOnce(flight.promise);

        const submitting = submitNow();
        await flush();
        type(input, 'not-an-email');
        flight.resolve({ success: true });
        await submitting;
        await flush();
        expect(harness.viewState().isSubmitted).toBe(true);
        expect(status(harness)).toBe('');

        blur(input);
        await advance();
        expect(harness.viewState().email.invalid).toBe(true);
        expect(status(harness)).toBe('');
    });

    it('should keep another field announcement when a different field is left valid', async () => {
        const email = fakeInput();
        const name = fakeInput();
        const harness = await mountForm([requiredEmail, requiredName], {
            email: { input: email },
            name: { input: name },
        });
        makeDirtyAndEmpty(email);
        blur(email);
        await advance();
        const emailError = errorOf(harness, 'email');
        expect(status(harness)).toBe(emailError);

        type(name, 'Ada');
        blur(name);
        await advance();
        expect(status(harness)).toBe(emailError);

        type(email, 'ada@example.com');
        expect(status(harness)).toBe('');
    });

    it('should withdraw a field announcement when a control commit fixes it', async () => {
        const input = fakeInput();
        const control = fakeControl('');
        const harness = await mountForm([requiredName], { name: { input, control } });
        makeDirtyAndEmpty(input);
        blur(input);
        await advance();
        expect(status(harness)).toBe(errorOf(harness, 'name'));

        control.setAttribute('data-value', 'Ada');
        listenerFor(control, 'input')({ target: control });
        expect(status(harness)).toBe('');
        await advance();
        expect(status(harness)).toBe('');
    });
});
