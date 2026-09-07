// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildSiteFormsCatalog } from '../lib/site-forms-catalog.js';

vi.mock('../lib/wix-apis/list-forms.js', () => ({
    listSiteFormSchemas: vi.fn(),
}));

vi.mock('../lib/wix-apis/get-form.js', () => ({
    getFormSchema: vi.fn(),
}));

import { listSiteFormSchemas } from '../lib/wix-apis/list-forms.js';
import { getFormSchema } from '../lib/wix-apis/get-form.js';

const mockList = vi.mocked(listSiteFormSchemas);
const mockGetForm = vi.mocked(getFormSchema);

describe('buildSiteFormsCatalog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should discover all usable forms from the Wix API', async () => {
        mockList.mockResolvedValue([
            { formId: 'form-a', title: 'Contact us' },
            { formId: 'form-b', title: 'Newsletter' },
        ]);
        mockGetForm.mockImplementation(async (_client, formId) => {
            if (formId === 'form-a') {
                return {
                    form: {
                        id: 'form-a',
                        fields: [
                            {
                                target: 'email',
                                view: { label: 'Email', fieldType: 'EMAIL' },
                                validation: { required: true },
                            },
                        ],
                    },
                };
            }
            return { form: { id: 'form-b', fields: [] } };
        });

        const catalog = await buildSiteFormsCatalog({} as never);

        expect(catalog.forms).toHaveLength(1);
        expect(catalog.forms[0]?.formId).toBe('form-a');
        expect(catalog.forms[0]?.contractName).toBe('ContactUsForm');
        expect(catalog.forms[0]?.contractSlug).toBe('contact-us-form');
    });
});
