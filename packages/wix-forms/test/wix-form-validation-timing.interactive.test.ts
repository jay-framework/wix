// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { submitForm } from '../lib/actions/forms-actions.js';
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
