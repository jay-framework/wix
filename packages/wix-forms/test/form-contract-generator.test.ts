// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { generator } from '../lib/generators/form-contract-generator.js';
import type { WixFormsService } from '../lib/services/wix-forms-service-marker.js';

function mockFormsService(): WixFormsService {
    return {
        catalog: {
            forms: [
                {
                    formId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                    title: 'Contact us',
                    contractName: 'ContactUsForm',
                    contractSlug: 'contact-us-form',
                },
            ],
        },
        getFormFields: vi.fn().mockResolvedValue([
            {
                target: 'email',
                label: 'Email',
                inputType: 'email',
                required: true,
                placeholder: '',
                options: [],
            },
            {
                target: 'message',
                label: 'Message',
                inputType: 'textarea',
                required: false,
                placeholder: '',
                options: [],
            },
        ]),
        getFormDisplayName: vi.fn(),
        getFormSummaryFields: vi.fn(),
        createSubmission: vi.fn(),
    };
}

describe('formContractGenerator', () => {
    it('should materialize ContactUsForm with fieldCatalog rows', async () => {
        const expected = readFileSync(
            join(import.meta.dirname, 'fixtures/form-contract-generator/expected-contact-us-form.jay-contract'),
            'utf-8',
        );

        const results = await generator.generate(mockFormsService());

        expect(results).toHaveLength(1);
        expect(results[0]?.name).toBe('ContactUsForm');
        expect(results[0]?.yaml).toEqual(expected);
        expect(results[0]?.metadata).toEqual({
            formId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            title: 'Contact us',
            fieldCount: 2,
        });
    });

    it('should return no contracts when site catalog is empty', async () => {
        const service = mockFormsService();
        service.catalog.forms = [];
        const results = await generator.generate(service);
        expect(results).toHaveLength(0);
    });
});
