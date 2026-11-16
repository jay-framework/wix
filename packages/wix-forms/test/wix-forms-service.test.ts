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

vi.mock('../lib/wix-apis/get-form.js', () => ({
    getFormSchema: vi.fn(),
}));

import { getFormSummary } from '../lib/wix-apis/get-form-summary.js';
import { listForms } from '../lib/wix-apis/list-forms.js';
import { getFormSchema } from '../lib/wix-apis/get-form.js';
import { fixtureTemplates } from './support/address-fixtures.js';
import { AddressLayoutsUnavailableError } from '../lib/address/address-templates.js';
import { provideWixFormsService } from '../lib/services/wix-forms-service.js';
import { fixtureField, formSummaryFixture, rawFormFixture } from './support/form-kinds.js';

const mockGetFormSummary = vi.mocked(getFormSummary);
const mockListForms = vi.mocked(listForms);
const mockGetFormSchema = vi.mocked(getFormSchema);
const FORM_ID = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const mockClient = {} as Parameters<typeof provideWixFormsService>[0];

function withTemplates() {
    return { addressTemplateSource: { load: async () => fixtureTemplates() } };
}
const testConfig = {
    namespace: 'wix.form_app.form',
    formIds: [],
    include: 'enabled' as const,
};

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

    /**
     * Bug: an empty List Forms result is not cached, so every listForms() call
     *   (the contract generator and agent-kit setup both call it) re-queries Wix
     *   and prints the "no forms" warning again.
     * Found in: review of the empty-forms warning (DL #40 follow-up).
     * Expected: one List Forms call and one warning per service instance.
     * Actual: a query and a warning on every call.
     */
    it('should query and warn only once when List Forms returns no forms', async () => {
        mockListForms.mockResolvedValue([]);
        const service = provideWixFormsService(mockClient, testConfig);

        await service.listForms();
        await expect(service.listForms()).resolves.toEqual([]);

        expect(mockListForms).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('should cache a non-empty list across calls', async () => {
        mockListForms.mockResolvedValueOnce([
            {
                id: 'form-1',
                name: 'Contact',
                formFields: rawFormFixture('contact-form').formFields,
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

    it('should throw when Wix returns no fields at all', async () => {
        mockGetFormSummary.mockResolvedValueOnce({ formSummary: { fields: [] } });
        const service = provideWixFormsService(mockClient, testConfig);

        await expect(service.getFormSummaryFields('form-1')).rejects.toThrow(
            'Could not load participant form fields from Wix.',
        );
    });

    it('should not throw when only unsupported fields are returned', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockGetFormSummary.mockResolvedValueOnce({
            formSummary: { fields: [{ target: 'photo', label: 'Photo', type: 'FILE' }] },
        });
        const service = provideWixFormsService(mockClient, testConfig);

        await expect(service.getFormSummaryFields('form-1')).resolves.toEqual({
            fields: [],
            unsupportedFields: [
                { target: 'photo', label: 'Photo', wixKind: 'FILE', required: 'unknown' },
            ],
        });
        vi.restoreAllMocks();
    });

    /** DL #51 §1: the dropped fields are logged once per form id, never silently lost. */
    it('should log the unsupported summary fields once per form id', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockGetFormSummary.mockResolvedValue(formSummaryFixture());
        const service = provideWixFormsService(mockClient, testConfig);

        await service.getFormSummaryFields('form-1');
        await service.getFormSummaryFields('form-1');

        expect(
            warn.mock.calls.filter(([message]) => /not supported/.test(String(message))),
        ).toEqual([
            [
                '[wix-forms] Form form-1: fields not supported and not returned: Multi-line address (MULTILINE_ADDRESS).',
            ],
        ]);
        vi.restoreAllMocks();
    });
});

describe('WixFormsService.getFormFields (DL #51 test 17)', () => {
    beforeEach(() => {
        mockGetFormSchema.mockReset();
    });

    it('should return only unsupported fields without throwing', async () => {
        mockGetFormSchema.mockResolvedValueOnce({
            form: { formFields: [fixtureField('booking-form-all-kinds', 'file_upload_1ffc')] },
        });
        const service = provideWixFormsService(mockClient, testConfig);

        await expect(service.getFormFields(FORM_ID)).resolves.toEqual({
            fields: [],
            unsupportedFields: [
                {
                    target: 'file_upload_1ffc',
                    label: 'File upload',
                    wixKind: 'WIX_FILE/FILE_UPLOAD',
                    required: false,
                },
            ],
        });
    });

    it('should throw when the form has neither supported nor unsupported fields', async () => {
        mockGetFormSchema.mockResolvedValueOnce({
            form: { formFields: [fixtureField('contact-form', 'SUBMIT_BUTTON')] },
        });
        const service = provideWixFormsService(mockClient, testConfig);

        await expect(service.getFormFields(FORM_ID)).rejects.toThrow(
            'Form has no usable input fields',
        );
    });
});

describe('WixFormsService.listForms (DL #51 §2)', () => {
    beforeEach(() => {
        mockListForms.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** DL #52 flips the address to supported; the templates load only for a form with one. */
    it('should list each form with its fields and hasAddress', async () => {
        mockListForms.mockResolvedValueOnce([
            { id: FORM_ID, name: 'Booking form', ...rawFormFixture('booking-form') },
        ]);
        const [form] = await provideWixFormsService(
            mockClient,
            testConfig,
            withTemplates(),
        ).listForms();

        expect(form?.fields.map((field) => field.target)).toEqual([
            'first_name',
            'last_name',
            'email',
            'phone',
            'address',
            'add_your_message',
        ]);
        expect(form?.unsupportedFields).toEqual([]);
        expect(form?.hasAddress).toBe(true);
    });

    it('should throw AddressLayoutsUnavailableError when the templates fail (never unsupported)', async () => {
        mockListForms.mockResolvedValueOnce([
            { id: FORM_ID, name: 'Booking form', ...rawFormFixture('booking-form') },
        ]);
        const failing = {
            addressTemplateSource: {
                load: () => Promise.reject(new AddressLayoutsUnavailableError()),
            },
        };
        await expect(
            provideWixFormsService(mockClient, testConfig, failing).listForms(),
        ).rejects.toBeInstanceOf(AddressLayoutsUnavailableError);
    });

    it('should not load templates for forms without an address', async () => {
        mockListForms.mockResolvedValueOnce([
            { id: FORM_ID, name: 'Contact', ...rawFormFixture('contact-form') },
        ]);
        const load = vi.fn();
        const [form] = await provideWixFormsService(mockClient, testConfig, {
            addressTemplateSource: { load },
        }).listForms();
        expect(load).not.toHaveBeenCalled();
        expect(form?.hasAddress).toBe(false);
    });

    it('should warn about a required field that has no target', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const form = rawFormFixture('contact-form');
        delete form.formFields!.find((field) => field.inputOptions?.target === 'email_7e06')!
            .inputOptions!.target;
        mockListForms.mockResolvedValueOnce([{ id: FORM_ID, name: 'QA Contact', ...form }]);

        await provideWixFormsService(mockClient, testConfig).listForms();

        expect(warn).toHaveBeenCalledWith(
            '[wix-forms] Form "QA Contact": required field "Email" has no target in Wix and cannot be submitted.',
        );
    });
});

describe('WixFormsService.createSubmission (DL#43)', () => {
    const SUBMISSIONS_URL = 'https://www.wixapis.com/form-submission-service/v4/submissions';

    function stubFetch() {
        const fetchMock = vi.fn(
            async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }),
        );
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    function siteClient() {
        const getAuthHeaders = vi.fn(async () => ({ headers: { Authorization: 'site-api-key' } }));
        const client = { auth: { getAuthHeaders } } as unknown as Parameters<
            typeof provideWixFormsService
        >[0];
        return { client, getAuthHeaders };
    }

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("caller submission sends the caller's access token as Authorization and never calls client.auth", async () => {
        const fetchMock = stubFetch();
        const { client, getAuthHeaders } = siteClient();

        await provideWixFormsService(client, testConfig).createSubmission(
            'form-1',
            { email: 'a@b.co' },
            'caller-token',
        );

        expect(fetchMock.mock.calls.map(([url, init]) => [url, init!.headers])).toEqual([
            [
                SUBMISSIONS_URL,
                { Authorization: 'caller-token', 'Content-Type': 'application/json' },
            ],
        ]);
        expect(getAuthHeaders).not.toHaveBeenCalled();
    });

    it('with no authorization posts with the site client (regression)', async () => {
        const fetchMock = stubFetch();
        const { client } = siteClient();

        await provideWixFormsService(client, testConfig).createSubmission('form-1', {
            email: 'a@b.co',
        });

        expect(fetchMock.mock.calls.map(([url, init]) => [url, init!.headers])).toEqual([
            [
                SUBMISSIONS_URL,
                { Authorization: 'site-api-key', 'Content-Type': 'application/json' },
            ],
        ]);
    });
});

describe('WixFormsService.isSubmittableForm', () => {
    beforeEach(() => {
        mockListForms.mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should list the namespace's enabled forms even when include is 'all'", async () => {
        const formId = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
        mockListForms.mockResolvedValueOnce([{ id: formId }]);
        const service = provideWixFormsService(mockClient, { ...testConfig, include: 'all' });

        expect(await service.isSubmittableForm(formId)).toBe(true);
        expect(mockListForms).toHaveBeenCalledWith(mockClient, {
            namespace: testConfig.namespace,
            include: 'enabled',
        });
    });
});

/**
 * Review round 3, m1: a form can be submittable but not listed (`include` / `formIds`): it must
 * fall through to the per-call projection, never be treated as address-free.
 */
describe('WixFormsService.addressFieldsOf (DL #52 §5)', () => {
    beforeEach(() => {
        mockListForms.mockReset();
        mockGetFormSchema.mockReset();
    });

    it('makes no Get Form call for a listed form without an address', async () => {
        mockListForms.mockResolvedValueOnce([
            { ...rawFormFixture('contact-form'), id: FORM_ID, name: 'Contact' },
        ]);
        const service = provideWixFormsService(mockClient, testConfig, withTemplates());
        expect(await service.addressFieldsOf(FORM_ID)).toEqual([]);
        expect(mockGetFormSchema).not.toHaveBeenCalled();
    });

    it('projects a form that is not listed, with the learned facts', async () => {
        mockListForms.mockResolvedValueOnce([]);
        mockGetFormSchema.mockResolvedValue({ form: rawFormFixture('booking-form') });
        const service = provideWixFormsService(mockClient, testConfig, withTemplates());
        service.learnedAddressFacts().revealPart('ZW', 'subdivision');
        const fields = await service.addressFieldsOf(FORM_ID);
        expect(fields.map((field) => field.target)).toEqual(['address']);
        expect(fields[0].address!.revealedPartsOf).toEqual({ ZW: ['subdivision'] });
        expect(mockGetFormSchema).toHaveBeenCalledTimes(1);
    });
});

/**
 * Bug: a form whose inputs exist only in the legacy `fields[]` (with an empty `formFields[]`)
 * projects to nothing, silently: no field, no unsupported field, no warning.
 * Found in: DL #52 live QA setup (form LF0, `evidence/dl52/lf0-listed.json`).
 * Expected: each legacy input is listed as unsupported (`LEGACY_FIELDS:<format>`) and a warning
 * names the cause. Actual: `fields: []`, `unsupportedFields: []`, nothing logged.
 */
describe('a form with inputs only in the legacy fields[] (DL #52 live QA)', () => {
    const legacyForm = {
        formFields: [],
        fields: [
            {
                target: 'address',
                validation: { required: true, predefined: { format: 'MULTILINE_ADDRESS' } },
                view: { label: 'address' },
            },
            {
                target: 'address_limited',
                validation: { required: false, predefined: { format: 'MULTILINE_ADDRESS' } },
                view: { label: 'address_limited' },
            },
        ],
    };
    const expectedUnsupported = [
        {
            target: 'address',
            label: 'address',
            wixKind: 'LEGACY_FIELDS:MULTILINE_ADDRESS',
            required: true,
        },
        {
            target: 'address_limited',
            label: 'address_limited',
            wixKind: 'LEGACY_FIELDS:MULTILINE_ADDRESS',
            required: false,
        },
    ];
    const LEGACY_WARNING =
        '[wix-forms] Form "LF0" has its inputs only in the legacy "fields[]" (its "formFields[]" is empty), which this plugin does not read: address, address_limited are unsupported. Re-create the form in the Wix Forms dashboard.';

    beforeEach(() => {
        mockListForms.mockReset();
        mockGetFormSchema.mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => vi.restoreAllMocks());

    it('lists the legacy inputs as unsupported at agent-kit generation and warns with the cause', async () => {
        mockListForms.mockResolvedValueOnce([{ id: FORM_ID, name: 'LF0', ...legacyForm }] as never);
        const [form] = await provideWixFormsService(
            mockClient,
            testConfig,
            withTemplates(),
        ).listForms();
        expect(form?.fields).toEqual([]);
        expect(form?.unsupportedFields).toEqual(expectedUnsupported);
        expect(console.warn).toHaveBeenCalledWith(LEGACY_WARNING);
    });

    it('marks them unsupported at runtime (getFormFields), naming the cause', async () => {
        mockGetFormSchema.mockResolvedValueOnce({
            form: { id: FORM_ID, name: 'LF0', ...legacyForm },
        } as never);
        const projected = await provideWixFormsService(
            mockClient,
            testConfig,
            withTemplates(),
        ).getFormFields(FORM_ID);
        expect(projected.unsupportedFields).toEqual(expectedUnsupported);
        expect(console.warn).toHaveBeenCalledWith(LEGACY_WARNING);
    });
});
