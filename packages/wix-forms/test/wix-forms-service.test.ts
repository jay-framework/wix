// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { provideWixFormsService } from '../lib/services/wix-forms-service.js';

const mockGetFormSummary = vi.fn();

vi.mock('../lib/wix-apis/get-form.js', () => ({
    getFormSchema: vi.fn(),
}));

vi.mock('../lib/wix-apis/get-form-summary.js', () => ({
    getFormSummary: (...args: unknown[]) => mockGetFormSummary(...args),
}));

describe('WixFormsService.getFormSummaryFields', () => {
    it('should reject empty formId', async () => {
        const service = provideWixFormsService({} as never, { forms: [] });

        await expect(service.getFormSummaryFields('')).rejects.toThrow(
            'Form ID is missing. This booking service has no participant form configured in Wix.',
        );
    });

    it('should reject when Wix returns no fields', async () => {
        mockGetFormSummary.mockResolvedValueOnce({ formSummary: { fields: [] } });
        const service = provideWixFormsService({} as never, { forms: [] });

        await expect(service.getFormSummaryFields('form-1')).rejects.toThrow(
            'Could not load participant form fields from Wix.',
        );
    });

    it('should return projected summary fields', async () => {
        mockGetFormSummary.mockResolvedValueOnce({
            formSummary: {
                fields: [
                    {
                        target: 'first_name',
                        label: 'First name',
                        type: 'STRING',
                        required: true,
                    },
                ],
            },
        });
        const service = provideWixFormsService({} as never, { forms: [] });

        await expect(service.getFormSummaryFields('form-1')).resolves.toEqual([
            {
                target: 'first_name',
                label: 'First name',
                type: 'STRING',
                required: true,
            },
        ]);
    });
});
