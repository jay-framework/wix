// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/actions/forms-actions.js', () => ({
    submitForm: vi.fn(async () => ({ success: true })),
    getFormSummary: vi.fn(),
}));
vi.mock('@jay-framework/wix-server-client/client', () => ({
    ensureSessionFresh: vi.fn(async () => undefined),
}));

import { submitForm } from '../lib/actions/forms-actions.js';
import { listenerFor, mountWixForm } from './support/wix-form-harness.js';

/** Lets every pending microtask and the reactive's `setTimeout(0)` auto-batch flush run. */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 10));
}

describe('wix-form confirmation focus (DL#41 Addendum A)', () => {
    /**
     * Bug: after a successful submit focus stays on BODY.
     * Found in: QA run 2026-11-10 (QA-REPORT finding 3; DL#41 Implementation Results).
     * Expected: the confirmation element (inside `if="…isSubmitted"`) receives focus.
     * Actual: the success path runs after `await`, outside any batch, so jay schedules the
     * flush that mounts the confirmation branch with `setTimeout(0)`; the focus microtask runs
     * first, while the `confirmation` ref is still unbound, and `exec$` no-ops.
     */
    it('should focus the confirmation once the submitted branch has mounted', async () => {
        const harness = mountWixForm();
        await Promise.resolve();

        listenerFor(harness.submitForm, 'submit')({ preventDefault: vi.fn() });
        await settle();

        expect(submitForm).toHaveBeenCalledTimes(1);
        expect(harness.confirmation.focus).toHaveBeenCalledTimes(1);
    });
});
