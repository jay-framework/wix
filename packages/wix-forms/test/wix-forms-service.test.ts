// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/stack-server-runtime', () => ({
    registerService: vi.fn(),
}));

vi.mock('../lib/wix-apis/get-form-summary.js', () => ({
    getFormSummary: vi.fn(),
}));

import { getFormSummary } from '../lib/wix-apis/get-form-summary.js';
import { provideWixFormsService } from '../lib/services/wix-forms-service.js';

const mockGetFormSummary = vi.mocked(getFormSummary);
const mockClient = {} as Parameters<typeof provideWixFormsService>[0];

describe('WixFormsService.getFormSummaryFields', () => {
    beforeEach(() => {
        mockGetFormSummary.mockReset();
    });

    it('should throw when formId is missing', async () => {
        const service = provideWixFormsService(mockClient, { defaultContactFormId: '' });

        await expect(service.getFormSummaryFields('')).rejects.toThrow(
            'This booking service has no participant form configured in Wix.',
        );
        expect(mockGetFormSummary).not.toHaveBeenCalled();
    });

    it('should throw when Wix returns no usable fields', async () => {
        mockGetFormSummary.mockResolvedValueOnce({ formSummary: { fields: [] } });
        const service = provideWixFormsService(mockClient, { defaultContactFormId: '' });

        await expect(service.getFormSummaryFields('form-1')).rejects.toThrow(
            'Could not load participant form fields from Wix.',
        );
    });

    it('should return projected fields when Wix returns a valid summary', async () => {
        mockGetFormSummary.mockResolvedValueOnce({
            formSummary: {
                fields: [
                    { target: 'email', label: 'Email', type: 'EMAIL', required: true },
                ],
            },
        });
        const service = provideWixFormsService(mockClient, { defaultContactFormId: '' });

        await expect(service.getFormSummaryFields('form-1')).resolves.toEqual([
            { target: 'email', label: 'Email', type: 'EMAIL', required: true },
        ]);
    });
});
