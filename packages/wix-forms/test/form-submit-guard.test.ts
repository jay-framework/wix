// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { guardNativeFormSubmit } from '../lib/components/form-submit-guard.js';

function fakeForm() {
    return { addEventListener: vi.fn() };
}

function asForm(form: ReturnType<typeof fakeForm>): HTMLFormElement {
    return form as unknown as HTMLFormElement;
}

describe('guardNativeFormSubmit (DL#44 §4)', () => {
    it('should add one submit listener however often it is called for the same form', () => {
        const form = fakeForm();
        const submit = vi.fn(async () => undefined);

        guardNativeFormSubmit(asForm(form), submit);
        guardNativeFormSubmit(asForm(form), submit);
        guardNativeFormSubmit(asForm(form), submit);

        expect(form.addEventListener).toHaveBeenCalledTimes(1);
        expect(form.addEventListener).toHaveBeenCalledWith('submit', expect.any(Function));
    });

    it('should cancel the native navigation and run the plugin submit', () => {
        const form = fakeForm();
        const submit = vi.fn(async () => undefined);
        guardNativeFormSubmit(asForm(form), submit);
        const event = { preventDefault: vi.fn() };

        form.addEventListener.mock.calls[0][1](event);

        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(submit).toHaveBeenCalledTimes(1);
    });

    it('should guard each form separately', () => {
        const first = fakeForm();
        const second = fakeForm();
        const submit = vi.fn(async () => undefined);

        guardNativeFormSubmit(asForm(first), submit);
        guardNativeFormSubmit(asForm(second), submit);

        expect(first.addEventListener).toHaveBeenCalledTimes(1);
        expect(second.addEventListener).toHaveBeenCalledTimes(1);
    });

    it.each([null, undefined])('should do nothing for a %s form', (form) => {
        expect(() =>
            guardNativeFormSubmit(
                form,
                vi.fn(async () => undefined),
            ),
        ).not.toThrow();
    });
});
