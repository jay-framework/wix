// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/stack-server-runtime', () => ({
    registerService: vi.fn(),
}));

vi.mock('../lib/wix-apis/get-form-summary.js', () => ({
    getFormSummary: vi.fn(),
}));

vi.mock('../lib/wix-apis/list-forms.js', () => ({
    listForms: vi.fn(),
}));

import { getFormSummary } from '../lib/wix-apis/get-form-summary.js';
import { listForms } from '../lib/wix-apis/list-forms.js';
import { provideWixFormsService } from '../lib/services/wix-forms-service.js';

const mockGetFormSummary = vi.mocked(getFormSummary);
const mockListForms = vi.mocked(listForms);
const mockClient = {} as Parameters<typeof provideWixFormsService>[0];
const testConfig = { namespace: 'wix.form_app.form', formIds: [], include: 'enabled' as const };

describe('WixFormsService.listForms', () => {
    beforeEach(() => {
        mockListForms.mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return an empty list and warn when List Forms returns no forms', async () => {
        mockListForms.mockResolvedValueOnce([]);
        const service = provideWixFormsService(mockClient, testConfig);

        await expect(service.listForms()).resolves.toEqual([]);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('No forms listed for namespace "wix.form_app.form"'),
        );
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no forms yet'));
    });

    it('should warn about formIds when the whitelist matches nothing', async () => {
        mockListForms.mockResolvedValueOnce([]);
        const service = provideWixFormsService(mockClient, {
            ...testConfig,
            formIds: ['missing-id'],
        });

        await expect(service.listForms()).resolves.toEqual([]);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('formIds'));
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('missing-id'));
    });

    it('should cache a non-empty list across calls', async () => {
        mockListForms.mockResolvedValueOnce([
            {
                id: 'form-1',
                name: 'Contact',
                formFields: [{ target: 'email', label: 'Email', type: 'EMAIL', required: true }],
            },
        ]);
        const service = provideWixFormsService(mockClient, testConfig);

        const first = await service.listForms();
        const second = await service.listForms();

        expect(first).toHaveLength(1);
        expect(first[0]?.id).toBe('form-1');
        expect(second).toBe(first);
        expect(mockListForms).toHaveBeenCalledTimes(1);
    });
});

describe('WixFormsService.getFormSummaryFields', () => {
    beforeEach(() => {
        mockGetFormSummary.mockReset();
    });

    it('should throw when formId is missing', async () => {
        const service = provideWixFormsService(mockClient, testConfig);

        await expect(service.getFormSummaryFields('')).rejects.toThrow(
            'This booking service has no participant form configured in Wix.',
        );
        expect(mockGetFormSummary).not.toHaveBeenCalled();
    });

    it('should throw when Wix returns no usable fields', async () => {
        mockGetFormSummary.mockResolvedValueOnce({ formSummary: { fields: [] } });
        const service = provideWixFormsService(mockClient, testConfig);

        await expect(service.getFormSummaryFields('form-1')).rejects.toThrow(
            'Could not load participant form fields from Wix.',
        );
    });

    it('should return projected fields when Wix returns a valid summary', async () => {
        mockGetFormSummary.mockResolvedValueOnce({
            formSummary: {
                fields: [{ target: 'email', label: 'Email', type: 'EMAIL', required: true }],
            },
        });
        const service = provideWixFormsService(mockClient, testConfig);

        await expect(service.getFormSummaryFields('form-1')).resolves.toEqual([
            { target: 'email', label: 'Email', type: 'EMAIL', required: true },
        ]);
    });
});
