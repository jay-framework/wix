// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/actions/forms-actions.js', () => ({
    submitForm: vi.fn(async () => ({ success: true })),
    getFormSummary: vi.fn(),
}));
vi.mock('@jay-framework/wix-server-client/client', () => ({
    ensureSessionFresh: vi.fn(async () => undefined),
}));

import { fakeButton, fakeForm, listenerFor, mountWixForm } from './support/wix-form-harness.js';

describe('wix-form native submit guard (DL#44 Phase 1)', () => {
    /**
     * Bug: the <form> `submit` guard never attaches (DL#44 Problem 2).
     * Found in: design-log/44, §Prior Art "jay timing".
     * Expected: a `submit` listener on the submit button's owning <form> once refs are bound.
     * Actual: the guard runs in a construction-time effect, before refs bind, so none is added
     * and a wired submit click inside a <form> performs the browser's GET navigation.
     */
    it('should attach the form submit listener once the submit button ref is bound', async () => {
        const harness = mountWixForm();
        await Promise.resolve();

        const submitCalls = harness.submitForm.addEventListener.mock.calls.filter(
            ([type]) => type === 'submit',
        );
        expect(submitCalls).toHaveLength(1);
    });

    /**
     * Bug: after a reset re-mounts the form branch with a new <form> node, nothing guards it.
     * Found in: design-log/44, Q3 and §4.
     * Expected: the new <form> gets one `submit` listener; the old one gets no second listener.
     * Actual: no install point re-runs after a re-mount.
     */
    it('should guard the new form after a reset re-mount', async () => {
        const harness = mountWixForm();
        await Promise.resolve();
        const firstForm = harness.submitForm;
        const newForm = fakeForm();

        listenerFor(
            harness.resetButton,
            'click',
        )({
            target: harness.resetButton,
            preventDefault: vi.fn(),
        });
        harness.submitRef.unmount();
        harness.submitRef.set(fakeButton(newForm));
        harness.submitRef.mount();
        await Promise.resolve();

        const submitListeners = (form: typeof newForm) =>
            form.addEventListener.mock.calls.filter(([type]) => type === 'submit');
        expect(submitListeners(newForm)).toHaveLength(1);
        expect(submitListeners(firstForm)).toHaveLength(1);
    });
});
