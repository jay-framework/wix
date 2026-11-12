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
import { FieldRule } from '../lib/components/field-rule.js';
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

function visibleField(target: string, inputType: FormFieldView['inputType']): FormFieldView {
    return { target, label: target, inputType, required: false, placeholder: '', options: [] };
}

const firstName = visibleField('firstName', 'text');
const email = visibleField('email', 'email');
const phone = visibleField('phone', 'tel');
const PADDED_PHONE = '+44 20 7946 0958 ';
const strictPhone = (value: unknown) =>
    /^\+?\d[\d ]*\d$/.test(String(value)) ? undefined : 'Digits and spaces only.';

function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 10));
}

async function mount(
    fields: FormFieldView[],
    fieldElements: Record<string, FakeFieldElements>,
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

function blur(input: FakeInput): void {
    listenerFor(input, 'blur')({});
}

function postedValues(call = 0): Record<string, unknown> {
    return (vi.mocked(submitForm).mock.calls[call][0] as any).values;
}

beforeEach(() => {
    captured.submit = undefined;
    vi.mocked(submitForm).mockReset();
    vi.mocked(submitForm).mockResolvedValue({ success: true });
});

afterEach(() => {
    clearGlobalContextRegistry();
    vi.restoreAllMocks();
});

/**
 * Bug: the post and the confirmation echo keep surrounding whitespace (DL #56 T).
 * Found in: design-log/56 §Problem 1.
 * Expected: "Ann " posts and echoes as "Ann"; page checks see the trimmed value on every path.
 * Actual: the raw store value is posted, echoed and handed to page checks on blur/typing.
 */
describe('wix-form trimmed values (DL #56 T)', () => {
    it('should post trimmed text values', async () => {
        const nameInput = fakeInput();
        const emailInput = fakeInput();
        await mount([firstName, email], {
            firstName: { input: nameInput },
            email: { input: emailInput },
        });
        type(nameInput, ' Ann ');
        type(emailInput, 'ann@example.com ');

        await submitOnce();

        expect(postedValues()).toEqual({ firstName: 'Ann', email: 'ann@example.com' });
    });

    it('should echo the trimmed value after success ("Thank you, Ann.")', async () => {
        const nameInput = fakeInput();
        const harness = await mount([firstName], { firstName: { input: nameInput } });
        type(nameInput, 'Ann ');

        await submitOnce();

        expect(harness.viewState().isSubmitted).toBe(true);
        expect(harness.viewState().firstName.value).toBe('Ann');
    });

    it('should hand trimmed values to a page check on submit', async () => {
        const check = vi.fn(() => undefined);
        provideWixFormsContext().registerFieldChecks(FORM_ID, { firstName: [check] });
        const nameInput = fakeInput();
        await mount([firstName], { firstName: { input: nameInput } });
        type(nameInput, ' Ann ');

        await submitOnce();

        expect(check).toHaveBeenCalledWith('Ann', { firstName: 'Ann' });
    });

    it('should not flag a padded value on blur under a strict page check', async () => {
        provideWixFormsContext().registerFieldChecks(FORM_ID, { phone: [strictPhone] });
        const input = fakeInput();
        const harness = await mount([phone], { phone: { input } });
        type(input, PADDED_PHONE);
        blur(input);
        await settle();

        expect(harness.viewState().phone).toMatchObject({ error: '', errorRule: FieldRule.NONE });
    });

    it('should clear a shown CUSTOM error when typing a padded valid value', async () => {
        provideWixFormsContext().registerFieldChecks(FORM_ID, { phone: [strictPhone] });
        const input = fakeInput();
        const harness = await mount([phone], { phone: { input } });
        type(input, '+44-20-7946-0958');
        await submitOnce();
        expect(harness.viewState().phone.errorRule).toBe(FieldRule.CUSTOM);

        type(input, PADDED_PHONE);
        await settle();

        expect(harness.viewState().phone).toMatchObject({ error: '', errorRule: FieldRule.NONE });
    });

    /** Regression guard: on submit the projected value already reached the check. */
    it('should submit a padded value that passes a strict page check once', async () => {
        provideWixFormsContext().registerFieldChecks(FORM_ID, { phone: [strictPhone] });
        const input = fakeInput();
        await mount([phone], { phone: { input } });
        type(input, PADDED_PHONE);

        await submitOnce();

        expect(submitForm).toHaveBeenCalledTimes(1);
    });

    /** Regression guard: a failure keeps the user's text so they can correct it. */
    it('should keep the raw store value after a server rejection', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { firstName: 'Wix says no.' },
        } as any);
        const nameInput = fakeInput();
        const harness = await mount([firstName], { firstName: { input: nameInput } });
        type(nameInput, 'Ann ');

        await submitOnce();

        expect(harness.viewState().firstName.value).toBe('Ann ');
    });

    it('should echo the trimmed value after a honeypot trip, as for a person', async () => {
        const nameInput = fakeInput();
        const harness = await mount([firstName], { firstName: { input: nameInput } });
        type(nameInput, 'Ann ');
        type(harness.honeypot, 'i am a bot');

        await submitOnce();

        expect(submitForm).not.toHaveBeenCalled();
        expect(harness.viewState().firstName.value).toBe('Ann');
    });

    /** Regression guard: "send another" never reconciles the old raw text back. */
    it('should post the new input after send-another following a trimmed success', async () => {
        const nameInput = fakeInput();
        const harness = await mount([firstName], { firstName: { input: nameInput } });
        type(nameInput, 'Ann ');
        await submitOnce();

        listenerFor(harness.resetButton, 'click')({ preventDefault: vi.fn() });
        await settle();
        type(nameInput, 'Bea');
        await submitOnce();

        expect(postedValues(1)).toEqual({ firstName: 'Bea' });
    });
});
