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
import type { FormFieldView } from '../lib/types.js';
import {
    listenerFor,
    mountWixForm,
    optionalTextField,
    type FakeCheckbox,
    type WixFormHarness,
} from './support/wix-form-harness.js';

const interests: FormFieldView = {
    target: 'interests',
    label: 'Interests',
    inputType: 'multiselect',
    required: true,
    placeholder: '',
    options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'c', label: 'C' },
    ],
};

async function mountChipForm(): Promise<WixFormHarness> {
    const harness = mountWixForm([optionalTextField, interests], interests);
    await Promise.resolve();
    return harness;
}

function toggleChip(chip: FakeCheckbox, checked: boolean): void {
    chip.checked = checked;
    listenerFor(chip, 'change')({ target: chip });
}

function submitNatively(harness: WixFormHarness): { preventDefault: ReturnType<typeof vi.fn> } {
    const event = { preventDefault: vi.fn() };
    listenerFor(harness.submitForm, 'submit')(event);
    return event;
}

function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve));
}

describe('wix-form checkbox-chip multiselect (DL#44 Phase 4)', () => {
    beforeEach(() => vi.mocked(submitForm).mockClear());

    it('should submit the toggled options as a string array in option order', async () => {
        const harness = await mountChipForm();
        const [chipA, , chipC] = harness.chips;

        toggleChip(chipC, true);
        toggleChip(chipA, true);
        submitNatively(harness);
        await vi.waitFor(() => expect(submitForm).toHaveBeenCalledTimes(1));

        expect(vi.mocked(submitForm).mock.calls[0][0]).toMatchObject({
            values: expect.objectContaining({ interests: ['a', 'c'] }),
        });
    });

    it('should uncheck every chip after reset', async () => {
        const harness = await mountChipForm();
        toggleChip(harness.chips[0], true);

        listenerFor(
            harness.resetButton,
            'click',
        )({ target: harness.resetButton, preventDefault: vi.fn() });
        await flush();

        expect(harness.chips.map((chip) => chip.checked)).toEqual([false, false, false]);
        expect(harness.chips[0].focus).toHaveBeenCalledTimes(1);
    });

    it('should focus the first chip when a required multiselect fails on submit', async () => {
        const harness = await mountChipForm();

        const event = submitNatively(harness);
        await flush();

        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(submitForm).not.toHaveBeenCalled();
        expect(harness.chips[0].focus).toHaveBeenCalledTimes(1);
    });
});
