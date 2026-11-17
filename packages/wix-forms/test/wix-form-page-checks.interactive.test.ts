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

const requiredEmail: FormFieldView = {
    target: 'email',
    label: 'Email',
    inputType: 'email',
    required: true,
    placeholder: '',
    options: [],
};

const optionalPhone: FormFieldView = {
    target: 'phone',
    label: 'Phone',
    inputType: 'tel',
    required: false,
    placeholder: '',
    options: [],
};

/**
 * DL#55 P1c rewrite: a local number with no country now fails the built-in PHONE_COUNTRY rule
 * before any page check, so the page-check tests that type a local GB number give the field its
 * country (the page check still sees what was typed).
 */
const gbPhone: FormFieldView = { ...optionalPhone, phone: { defaultCountry: 'GB' } };

const internationalOnly = (value: unknown) =>
    String(value).startsWith('+') ? undefined : 'Use an international number, e.g. +44 20 …';

/** Lets every pending microtask and the reactive's `setTimeout(0)` auto-batch flush run. */
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

function fieldView(harness: WixFormHarness, target: string): Record<string, any> {
    return harness.viewState()[target];
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
 * Bug: a page cannot tell which rule failed, nor add its own rule (DL#53 G1).
 * Found in: design-log/53 §Problem G1 — the field sub-contract has `error` / `invalid` only.
 * Expected: each field carries `errorRule`; page checks run after the built-ins pass, as CUSTOM.
 * Actual: no `errorRule` in the view state and registered checks never run.
 */
describe('wix-form errorRule (DL#53 G1)', () => {
    it('should report the built-in rule that failed', async () => {
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });

        await submitOnce();
        expect(fieldView(harness, 'email').errorRule).toBe(FieldRule.REQUIRED);

        type(input, 'not-an-email');
        blur(input);
        await settle();
        expect(fieldView(harness, 'email').errorRule).toBe(FieldRule.EMAIL);
    });

    it('should reset errorRule to NONE when typing clears the error', async () => {
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        await submitOnce();

        type(input, 'ada@example.com');
        await settle();

        expect(fieldView(harness, 'email')).toMatchObject({
            error: '',
            invalid: false,
            errorRule: FieldRule.NONE,
        });
    });

    it('should mark a visible field rejected by the server as SERVER, and typing clears it', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { email: 'Wix says no.' },
        } as any);
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        type(input, 'ada@example.com');

        await submitOnce();
        expect(fieldView(harness, 'email')).toMatchObject({
            error: 'Wix says no.',
            errorRule: FieldRule.SERVER,
        });

        type(input, 'grace@example.com');
        await settle();
        expect(fieldView(harness, 'email')).toMatchObject({ error: '', errorRule: FieldRule.NONE });
    });

    /**
     * Bug: a Wix error the plugin classifies showed as SERVER with Wix's text (DL#55 Problem 2).
     * Found in: design-log/55 - wix validation parity for wix-forms.md §Design 2 (trace `a@b.c`)
     * Expected: errorRule EMAIL and the default email text.
     */
    it('should show a classified server error with its rule and default text', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { email: 'must match format "email"' },
            fieldRules: { email: FieldRule.EMAIL },
        } as any);
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        type(input, 'a@b.c');

        await submitOnce();
        expect(fieldView(harness, 'email')).toMatchObject({
            error: 'Please enter a valid email address.',
            errorRule: FieldRule.EMAIL,
        });
    });

    /**
     * Bug: a hook FieldRejection and a Wix refusal are both SERVER, so markup can only tell them
     * apart by text (DL #57 H). Found in: design-log/56 §Problem 2.
     * Expected: a result with `fromHook: true` marks its visible targets HOOK. Actual: SERVER.
     */
    it('should mark fields from a hook FieldRejection result as HOOK', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { email: 'Use your work email.' },
            code: 'WORK_EMAIL',
            fromHook: true,
        } as any);
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        type(input, 'ada@example.com');

        await submitOnce();

        expect(fieldView(harness, 'email')).toMatchObject({
            error: 'Use your work email.',
            invalid: true,
            errorRule: FieldRule.HOOK,
        });
        expect(input.focus).toHaveBeenCalled();
    });

    /** DL #57 H: a hook rejection without a code is still HOOK; provenance is `fromHook`, not `code`. */
    it('should mark a fromHook result without a code as HOOK', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { email: 'Use your work email.' },
            fromHook: true,
        } as any);
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        type(input, 'ada@example.com');

        await submitOnce();

        expect(fieldView(harness, 'email').errorRule).toBe(FieldRule.HOOK);
    });

    /** DL #57 H: typing a valid value clears a HOOK error, as it clears SERVER. */
    it('should clear a HOOK error when typing a valid value', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { email: 'Use your work email.' },
            fromHook: true,
        } as any);
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        type(input, 'ada@example.com');
        await submitOnce();
        expect(fieldView(harness, 'email').errorRule).toBe(FieldRule.HOOK);

        type(input, 'ada@work.example.com');
        await settle();

        expect(fieldView(harness, 'email')).toMatchObject({ error: '', errorRule: FieldRule.NONE });
    });

    it('should clear invalid and errorRule at submit start, so a network failure leaves no stale aria-invalid', async () => {
        vi.mocked(submitForm).mockRejectedValueOnce(new Error('offline'));
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        await submitOnce(); // REQUIRED error shown

        input.value = 'ada@example.com'; // autofill, no input event: the error stays shown
        await submitOnce();

        expect(fieldView(harness, 'email')).toMatchObject({
            error: '',
            invalid: false,
            errorRule: FieldRule.NONE,
        });
        expect(harness.viewState().submitFailure).toBe(SubmitFailure.NETWORK);
    });

    it('should reset errorRule to NONE on reset', async () => {
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        await submitOnce();

        listenerFor(harness.resetButton, 'click')({ preventDefault: vi.fn() });
        await settle();

        expect(fieldView(harness, 'email').errorRule).toBe(FieldRule.NONE);
    });
});

describe('wix-form page checks (DL#53 G1)', () => {
    it('should block submit with a failing page check, reported as CUSTOM with its message', async () => {
        provideWixFormsContext().registerFieldChecks(FORM_ID, { phone: [internationalOnly] });
        const input = fakeInput();
        const harness = await mount([gbPhone], { phone: { input } });
        type(input, '020 7946 0000');

        await submitOnce();

        expect(submitForm).not.toHaveBeenCalled();
        expect(fieldView(harness, 'phone')).toMatchObject({
            error: 'Use an international number, e.g. +44 20 …',
            invalid: true,
            errorRule: FieldRule.CUSTOM,
        });
        expect(harness.viewState().submitFailure).toBe(SubmitFailure.VALIDATION);
    });

    it('should run checks registered after the form was constructed', async () => {
        const context = provideWixFormsContext();
        const input = fakeInput();
        const harness = await mount([gbPhone], { phone: { input } });
        context.registerFieldChecks(FORM_ID, { phone: [internationalOnly] });

        type(input, '020 7946 0000');
        blur(input);
        await settle();

        expect(fieldView(harness, 'phone').errorRule).toBe(FieldRule.CUSTOM);
    });

    it('should run page checks only after the built-in rules pass', async () => {
        const check = vi.fn(() => 'page says no');
        provideWixFormsContext().registerFieldChecks(FORM_ID, { phone: [check] });
        const input = fakeInput();
        const harness = await mount([optionalPhone], { phone: { input } });
        type(input, 'abc'); // fails the built-in PHONE rule

        await submitOnce();

        expect(check).not.toHaveBeenCalled();
        expect(fieldView(harness, 'phone').errorRule).toBe(FieldRule.PHONE);
    });

    it('should keep a CUSTOM error while typing until the page check passes', async () => {
        provideWixFormsContext().registerFieldChecks(FORM_ID, { phone: [internationalOnly] });
        const input = fakeInput();
        const harness = await mount([gbPhone], { phone: { input } });
        type(input, '020 7946 0000');
        await submitOnce();

        type(input, '020 7946 0001'); // valid for the built-ins, still fails the page check
        await settle();
        expect(fieldView(harness, 'phone').errorRule).toBe(FieldRule.CUSTOM);

        type(input, '+44 20 7946 0001');
        await settle();
        expect(fieldView(harness, 'phone')).toMatchObject({ error: '', errorRule: FieldRule.NONE });
    });

    it('should pass the submitted values to a check', async () => {
        const check = vi.fn(() => undefined);
        provideWixFormsContext().registerFieldChecks(FORM_ID, { phone: [check] });
        const emailInput = fakeInput();
        const phoneInput = fakeInput();
        await mount([requiredEmail, optionalPhone], {
            email: { input: emailInput },
            phone: { input: phoneInput },
        });
        type(emailInput, 'ada@example.com');
        type(phoneInput, '+44 20 7946 0000');

        await submitOnce();

        expect(check).toHaveBeenCalledWith('+44 20 7946 0000', {
            email: 'ada@example.com',
            phone: '+44 20 7946 0000',
        });
        expect(submitForm).toHaveBeenCalledTimes(1);
    });

    it('should treat a throwing check as a pass and log it once', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        provideWixFormsContext().registerFieldChecks(FORM_ID, {
            phone: [
                () => {
                    throw new Error('page bug');
                },
            ],
        });
        const input = fakeInput();
        const harness = await mount([optionalPhone], { phone: { input } });
        type(input, '+44 20 7946 0000');

        blur(input);
        await submitOnce();

        expect(submitForm).toHaveBeenCalledTimes(1);
        expect(fieldView(harness, 'phone').errorRule).toBe(FieldRule.NONE);
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('should warn once about a check registered on a target the form does not show', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        provideWixFormsContext().registerFieldChecks(FORM_ID, { fax: [internationalOnly] });
        const input = fakeInput();
        await mount([optionalPhone], { phone: { input } });
        type(input, '+44 20 7946 0000');

        await submitOnce();
        await submitOnce();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('"fax"');
        expect(submitForm).toHaveBeenCalledTimes(2);
    });

    it('should run built-in rules only, without throwing, when no context is registered', async () => {
        const input = fakeInput();
        const harness = await mount([gbPhone], { phone: { input } });
        type(input, '020 7946 0000');

        await submitOnce();

        expect(submitForm).toHaveBeenCalledTimes(1);
        expect(fieldView(harness, 'phone').errorRule).toBe(FieldRule.NONE);
    });
});

/**
 * Bug: Wix's caller path refuses every phone shape but compact E.164; the plugin posted phones as
 *   typed, so a local number cost a round trip and the visitor never learned what Wix wants.
 * Found in: design-log/55 - wix validation parity for wix-forms.md §1c, Implementation Results
 *   "Live check (2026-11-11)".
 * Expected: without a country, a local phone is refused in the browser as PHONE_COUNTRY; with one,
 *   it is sent as E.164 while the input keeps what the visitor typed.
 */
describe('wix-form phone normalization (DL#55 P1c)', () => {
    it('should refuse a local phone with no country as PHONE_COUNTRY without submitting', async () => {
        const input = fakeInput();
        const harness = await mount([optionalPhone], { phone: { input } });
        type(input, '054.123.4567');

        await submitOnce();

        expect(submitForm).not.toHaveBeenCalled();
        expect(fieldView(harness, 'phone')).toMatchObject({
            error: 'Please include the country code, starting with +.',
            errorRule: FieldRule.PHONE_COUNTRY,
        });
    });

    it('should send a local phone as E.164 when the field has a default country', async () => {
        const input = fakeInput();
        await mount([{ ...optionalPhone, phone: { defaultCountry: 'IL' } }], { phone: { input } });
        type(input, '054.123.4567');

        await submitOnce();

        expect(submitForm).toHaveBeenCalledTimes(1);
        expect(vi.mocked(submitForm).mock.calls[0][0]).toMatchObject({
            values: { phone: '+972541234567' },
        });
        expect(input.value).toBe('054.123.4567');
    });
});

/**
 * Bug: a page that words its own field errors (branching on errorRule) has them announced in the
 * plugin's English default, because the announcement is the field's `error` (DL #59 behaviour 7).
 * Found in: design-log/59 §Design "Page wording".
 * Expected: registerFieldChecks' optional `messages` map is the field's `error` for a built-in or
 * Wix-format rule, so the visible and announced texts are one; CUSTOM and HOOK are never reworded.
 * Actual: registerFieldChecks takes no third argument; `error` is always the default text.
 */
describe('wix-form page wording through registerFieldChecks messages (DL #59)', () => {
    const FRENCH_REQUIRED = 'Indiquez votre e-mail.';
    const frenchEmail = { email: { [FieldRule.REQUIRED]: FRENCH_REQUIRED } };

    function register(messages: Record<string, Partial<Record<FieldRule, string>>>) {
        return provideWixFormsContext().registerFieldChecks(FORM_ID, {}, { messages });
    }

    async function blurEmptyEmail(harness: WixFormHarness, input: FakeInput): Promise<void> {
        type(input, 'a');
        type(input, '');
        blur(input);
        await settle();
    }

    it("should use the page's registered wording as the field error and announce it", async () => {
        register(frenchEmail);
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });

        await blurEmptyEmail(harness, input);

        expect(fieldView(harness, 'email')).toMatchObject({
            error: FRENCH_REQUIRED,
            errorRule: FieldRule.REQUIRED,
        });
        expect(harness.viewState().statusMessage).toBe(FRENCH_REQUIRED);
    });

    it("should fall back to the plugin's default text for a rule the page did not word", async () => {
        register(frenchEmail);
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });

        type(input, 'x');
        blur(input);
        await settle();

        expect(fieldView(harness, 'email').errorRule).toBe(FieldRule.EMAIL);
        expect(fieldView(harness, 'email').error).not.toBe('');
        expect(fieldView(harness, 'email').error).not.toBe(FRENCH_REQUIRED);
        expect(harness.viewState().statusMessage).toBe(fieldView(harness, 'email').error);
    });

    it("should use the page's wording for submit-time client errors", async () => {
        register(frenchEmail);
        const harness = await mount([requiredEmail], { email: { input: fakeInput() } });

        await submitOnce();

        expect(fieldView(harness, 'email').error).toBe(FRENCH_REQUIRED);
    });

    it.each([
        [FieldRule.EMAIL, 'Cette adresse e-mail ne semble pas valide.'],
        [FieldRule.SERVER, 'Nous ne pouvons pas accepter cette adresse.'],
    ])("should use the page's wording for a Wix %s rejection", async (rule, wording) => {
        register({ email: { [rule]: wording } });
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        type(input, 'ada@example.com');
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.VALIDATION,
            fieldErrors: { email: 'Wix text' },
            fieldRules: { email: rule },
        } as any);

        await submitOnce();

        expect(fieldView(harness, 'email')).toMatchObject({ error: wording, errorRule: rule });
    });

    it('should never reword a HOOK rejection or a page check CUSTOM text', async () => {
        provideWixFormsContext().registerFieldChecks(
            FORM_ID,
            { phone: [internationalOnly] },
            {
                messages: {
                    email: { [FieldRule.HOOK]: 'reworded hook' },
                    phone: { [FieldRule.CUSTOM]: 'reworded custom' },
                },
            },
        );
        const email = fakeInput();
        const phone = fakeInput();
        const harness = await mount([requiredEmail, gbPhone], {
            email: { input: email },
            phone: { input: phone },
        });
        type(phone, '020 7946 0000');
        blur(phone);
        await settle();
        expect(fieldView(harness, 'phone')).toMatchObject({
            error: 'Use an international number, e.g. +44 20 …',
            errorRule: FieldRule.CUSTOM,
        });

        type(phone, '+44 20 7946 0000');
        type(email, 'ada@example.com');
        vi.mocked(submitForm).mockResolvedValueOnce({
            success: false,
            reason: SubmitFailure.REJECTED,
            fieldErrors: { email: 'The hook says no' },
            fromHook: true,
        } as any);
        await submitOnce();
        expect(fieldView(harness, 'email')).toMatchObject({
            error: 'The hook says no',
            errorRule: FieldRule.HOOK,
        });
    });

    it('should stop using the wording after unregister', async () => {
        const unregister = register(frenchEmail);
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });
        await blurEmptyEmail(harness, input);
        expect(fieldView(harness, 'email').error).toBe(FRENCH_REQUIRED);

        unregister();
        blur(input);
        await settle();

        expect(fieldView(harness, 'email').errorRule).toBe(FieldRule.REQUIRED);
        expect(fieldView(harness, 'email').error).not.toBe(FRENCH_REQUIRED);
        expect(fieldView(harness, 'email').error).not.toBe('');
    });

    it("should use the first registration's wording for the same field and rule", async () => {
        const context = provideWixFormsContext();
        context.registerFieldChecks(FORM_ID, {}, { messages: frenchEmail });
        context.registerFieldChecks(
            FORM_ID,
            {},
            {
                messages: { email: { [FieldRule.REQUIRED]: 'Second wording' } },
            },
        );
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });

        await blurEmptyEmail(harness, input);

        expect(fieldView(harness, 'email').error).toBe(FRENCH_REQUIRED);
    });

    it('should warn once about a messages target that is not a visible field', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        register({ nickname: { [FieldRule.REQUIRED]: 'Pick a nickname' } });
        const input = fakeInput();
        const harness = await mount([requiredEmail], { email: { input } });

        await blurEmptyEmail(harness, input);
        blur(input);
        await settle();

        const nicknameWarnings = warn.mock.calls.filter(([text]) =>
            String(text).includes('"nickname"'),
        );
        expect(nicknameWarnings).toHaveLength(1);
        expect(fieldView(harness, 'email').errorRule).toBe(FieldRule.REQUIRED);
    });
});
