// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/actions/forms-actions.js', () => ({
    submitForm: vi.fn(async () => ({ success: true })),
    getFormSummary: vi.fn(),
}));
vi.mock('@jay-framework/wix-server-client/client', () => ({
    ensureSessionFresh: vi.fn(async () => undefined),
}));

import { submitForm } from '../lib/actions/forms-actions.js';
import { SubmitFailure } from '../lib/components/submit-outcome.js';
import type { FormFieldView } from '../lib/types.js';
import {
    fakeControl,
    fakeInput,
    listenerFor,
    mountWixForm,
    optionalTextField,
    type WixFormHarness,
} from './support/wix-form-harness.js';

/** Lets every pending microtask and the reactive's `setTimeout(0)` auto-batch flush run. */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 10));
}

const hiddenSlotField: FormFieldView = {
    target: 'slotId',
    label: 'Slot',
    inputType: 'text',
    required: false,
    placeholder: '',
    options: [],
    hidden: true,
};

const rejection = { success: false, reason: SubmitFailure.REJECTED, message: 'Taken.' };

async function submitOnce(harness: WixFormHarness): Promise<void> {
    listenerFor(harness.submitForm, 'submit')({ preventDefault: vi.fn() });
    await settle();
}

async function resetOnce(harness: WixFormHarness): Promise<void> {
    listenerFor(harness.resetButton, 'click')({ preventDefault: vi.fn() });
    await settle();
}

function postedValues(call: number): Record<string, unknown> {
    return vi.mocked(submitForm).mock.calls[call][0].values;
}

/**
 * Bug: control values (hidden fields, custom-UI defaults) go stale (DL#53 G5).
 * Found in: design-log/53 §Problem G5 — `seedControlValues` skips targets already in the store
 *   and empty values (`submission-values.ts:99`), the mount seed runs before refs bind, and a
 *   reset stores every field as empty, so no control seeds again.
 * Expected: every seed (mount, reset, submit) refreshes non-dirty bound controls from the page.
 * Actual: the first submitted value sticks; '' never clears; after reset hidden values are ''.
 */
describe('wix-form control refresh (DL#53 G5)', () => {
    beforeEach(() => {
        vi.mocked(submitForm).mockReset();
        vi.mocked(submitForm).mockResolvedValue({ success: true });
    });

    it('should post the new hidden value when the page changes it after a failed submit', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce(rejection);
        const slot = fakeControl('s-1');
        const harness = mountWixForm([hiddenSlotField], undefined, { slotId: { control: slot } });
        await settle();

        await submitOnce(harness);
        slot.setAttribute('data-value', 's-42');
        await submitOnce(harness);

        expect(postedValues(1)).toEqual({ slotId: 's-42' });
    });

    it('should post an empty value when the page clears a bound control after a failed submit', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce(rejection);
        const slot = fakeControl('s-1');
        const harness = mountWixForm([hiddenSlotField], undefined, { slotId: { control: slot } });
        await settle();

        await submitOnce(harness);
        slot.setAttribute('data-value', '');
        await submitOnce(harness);

        expect(postedValues(1)).toEqual({ slotId: '' });
    });

    it('should post an empty value when a non-dirty bound widget loses its data-value', async () => {
        vi.mocked(submitForm).mockResolvedValueOnce(rejection);
        const widget = fakeControl('s-1');
        const harness = mountWixForm([hiddenSlotField], undefined, {
            slotId: { control: widget },
        });
        await settle();

        await submitOnce(harness);
        widget.removeAttribute('data-value');
        await submitOnce(harness);

        expect(postedValues(1)).toEqual({ slotId: '' });
    });

    it('should post the hidden value again after "send another"', async () => {
        const slot = fakeControl('s-1');
        const harness = mountWixForm([hiddenSlotField], undefined, { slotId: { control: slot } });
        await settle();

        await submitOnce(harness);
        await resetOnce(harness);
        await submitOnce(harness);

        expect(postedValues(1)).toEqual({ slotId: 's-1' });
    });

    it('should show a visible field control default in its input after mount', async () => {
        const input = fakeInput();
        mountWixForm([optionalTextField], undefined, {
            name: { input, control: fakeControl('Ada') },
        });
        await settle();

        expect(input.value).toBe('Ada');
    });

    it('should show the posted value in the input when the page changes a visible default before submit', async () => {
        const input = fakeInput();
        const control = fakeControl('Ada');
        const harness = mountWixForm([optionalTextField], undefined, { name: { input, control } });
        await settle();

        control.setAttribute('data-value', 'Grace');
        await submitOnce(harness);

        expect(postedValues(0)).toEqual({ name: 'Grace' });
        expect(input.value).toBe('Grace');
    });
});
