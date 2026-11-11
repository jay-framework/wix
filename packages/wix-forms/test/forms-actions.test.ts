// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { ActionError } from '@jay-framework/fullstack-component';
import { getFormSummary } from '../lib/actions/forms-actions.js';
import type { WixFormsService } from '../lib/services/wix-forms-service-marker.js';

function formsServiceStub(): WixFormsService {
    return {
        getFormSummaryFields: vi.fn(async () => [
            { target: 'first_name', label: 'First name', type: 'STRING', required: false },
        ]),
    } as unknown as WixFormsService;
}

describe('getFormSummary query', () => {
    /**
     * Bug: a refused form id surfaced as HTTP 500 INTERNAL_ERROR with the raw message.
     * Found in: QA run 2026-11-10 (FEEDBACK #17; DL#49 Implementation Results).
     * Expected: an ActionError with code INVALID_INPUT (a 4xx), and no Wix call.
     * Actual: the service threw a plain Error, which jay maps to a 500.
     */
    it.each([['../../x'], ['%2e%2e'], ['not-a-guid'], [undefined]])(
        'should refuse form id %s with an INVALID_INPUT ActionError',
        async (formId) => {
            const forms = formsServiceStub();
            const call = getFormSummary.handler({ formId } as { formId?: string }, forms);
            await expect(call).rejects.toBeInstanceOf(ActionError);
            await expect(call).rejects.toMatchObject({ code: 'INVALID_INPUT' });
            expect(forms.getFormSummaryFields).not.toHaveBeenCalled();
        },
    );

    it('should pass a valid GUID form id to the service', async () => {
        const forms = formsServiceStub();
        const formId = '51564e13-e980-41f2-8525-eadb6e72a9bc';
        const result = await getFormSummary.handler({ formId }, forms);
        expect(forms.getFormSummaryFields).toHaveBeenCalledWith(formId);
        expect(result.fields).toHaveLength(1);
    });
});
