// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const testConfig = {
    namespace: 'wix.form_app.form',
    formIds: [],
    include: 'enabled' as const,
    memberPrefill: {},
};

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

describe('WixFormsService.createSubmission (DL#41)', () => {
    const SUBMISSIONS_URL = 'https://www.wixapis.com/form-submission-service/v4/submissions';

    function stubFetch() {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    function siteClient() {
        const getAuthHeaders = vi.fn(async () => ({ headers: { Authorization: 'site-api-key' } }));
        const client = { auth: { getAuthHeaders } } as unknown as Parameters<typeof provideWixFormsService>[0];
        return { client, getAuthHeaders };
    }

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("caller submission sends the caller's access token as Authorization and never calls client.auth", async () => {
        const fetchMock = stubFetch();
        const { client, getAuthHeaders } = siteClient();

        await provideWixFormsService(client, testConfig).createSubmission('form-1', { email: 'a@b.co' }, 'caller-token');

        expect(fetchMock.mock.calls.map(([url, init]) => [url, init!.headers])).toEqual([
            [SUBMISSIONS_URL, { Authorization: 'caller-token', 'Content-Type': 'application/json' }],
        ]);
        expect(getAuthHeaders).not.toHaveBeenCalled();
    });

    it('with no authorization posts with the site client (regression)', async () => {
        const fetchMock = stubFetch();
        const { client } = siteClient();

        await provideWixFormsService(client, testConfig).createSubmission('form-1', { email: 'a@b.co' });

        expect(fetchMock.mock.calls.map(([url, init]) => [url, init!.headers])).toEqual([
            [SUBMISSIONS_URL, { Authorization: 'site-api-key', 'Content-Type': 'application/json' }],
        ]);
    });
});
