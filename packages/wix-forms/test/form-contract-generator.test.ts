// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseContract } from '@jay-framework/compiler-jay-html';
import { checkValidationErrors } from '@jay-framework/compiler-shared';
import { generator as formContractGenerator } from '../lib/generators/form-contract-generator.js';
import type { ListedFormView } from '../lib/types.js';
import type { WixFormsService } from '../lib/services/wix-forms-service-marker.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function serviceWith(forms: ListedFormView[]): WixFormsService {
    return {
        config: { namespace: 'wix.form_app.form', formIds: [], include: 'enabled', memberPrefill: {} },
        listForms: async () => forms,
        getFormFields: async () => [],
        getFormSummaryFields: async () => [],
        createSubmission: async () => {},
    };
}

const contactForm: ListedFormView = {
    id: 'f1a2b3',
    name: 'Contact',
    fields: [
        { target: 'firstName', label: 'First name', inputType: 'text', required: true, placeholder: '', options: [] },
        { target: 'email', label: 'Email', inputType: 'email', required: true, placeholder: '', options: [] },
        { target: 'message', label: 'Message', inputType: 'textarea', required: false, placeholder: '', options: [] },
        {
            target: 'country',
            label: 'Country',
            inputType: 'select',
            required: false,
            placeholder: '',
            options: [
                { value: 'us', label: 'United States' },
                { value: 'ca', label: 'Canada' },
            ],
        },
    ],
};

describe('formContractGenerator', () => {
    it('should generate one contract per form with field-named tags, keyed metadata, and form/<slug> name', async () => {
        const expected = await readFile(path.join(fixturesDir, 'form-contract-generator', 'contact.jay-contract'), 'utf-8');

        const [contract, ...rest] = await formContractGenerator.generate(serviceWith([contactForm]));

        expect(rest).toEqual([]);
        expect(contract.name).toEqual('contact');
        expect(contract.metadata).toEqual({ formId: 'f1a2b3' });
        expect(contract.yaml.trim()).toEqual(expected.trim());
    });

    /**
     * Bug (DL#39 4c, test 4 — runtime, failing-first): the generator cannot express a
     *   non-string field, so a checkbox and a multiselect are mis-modeled.
     * Found in: design-log/39 - general forms infrastructure.md §Design 4c (MUST-VERIFY #2).
     * Expected: a checkbox field emits a `value` VARIANT (boolean) and HTMLInputElement input;
     *   a multiselect emits the repeated `options` sub-contract with a per-option `selected`
     *   variant and an HTMLSelectElement input. No `dataType: array` anywhere.
     * Actual (pre-fix): the generator emits a `value` DATA (string) for the checkbox, an
     *   HTMLInputElement for the multiselect, and no `selected` variant — this fails red as
     *   a fixture diff until 4c lands.
     */
    it('should model a checkbox as a boolean value variant and a multiselect via options.selected', async () => {
        const expected = await readFile(
            path.join(fixturesDir, 'form-contract-generator', 'choices.jay-contract'),
            'utf-8',
        );
        const choicesForm: ListedFormView = {
            id: 'c1',
            name: 'Choices',
            fields: [
                { target: 'consent', label: 'I agree', inputType: 'checkbox', required: true, placeholder: '', options: [] },
                {
                    target: 'interests',
                    label: 'Interests',
                    inputType: 'multiselect',
                    required: false,
                    placeholder: '',
                    options: [
                        { value: 'news', label: 'News' },
                        { value: 'offers', label: 'Offers' },
                    ],
                },
            ],
        };

        const [contract] = await formContractGenerator.generate(serviceWith([choicesForm]));
        expect(contract.yaml.trim()).toEqual(expected.trim());
        // The shape must parse — confirms the nested per-option `selected` variant inside a
        // repeated sub-contract round-trips (DL#39 MUST-VERIFY #2).
        expect(() =>
            checkValidationErrors(parseContract(contract.yaml, 'form-choices.jay-contract')),
        ).not.toThrow();
    });

    it('should produce a contract that parses without validation errors', async () => {
        const [contract] = await formContractGenerator.generate(serviceWith([contactForm]));
        expect(() =>
            checkValidationErrors(parseContract(contract.yaml, 'form-contact.jay-contract')),
        ).not.toThrow();
    });

    /**
     * Bug: Break B — a real Wix form returns snake_case / kebab-case field
     * targets (e.g. `first_name`, `phone-number`). jay camelCases every
     * contract tag into its ViewState accessor and ref name, so the generated
     * tag MUST be camelCased or the page's `{form.firstName...}` bindings and
     * `ref="form.firstName.input"` resolve to undefined.
     * Found in: design-log/38 - per-form contracts for wix-forms.md
     * Expected: generated tags are `firstName` / `phoneNumber`, never the raw
     * `first_name` / `phone-number`.
     */
    it('should camelCase snake_case and kebab-case field targets into contract tags', async () => {
        const form: ListedFormView = {
            id: 'f9',
            name: 'Snake Form',
            fields: [
                { target: 'first_name', label: 'First name', inputType: 'text', required: true, placeholder: '', options: [] },
                { target: 'phone-number', label: 'Phone', inputType: 'text', required: false, placeholder: '', options: [] },
            ],
        };

        const [contract] = await formContractGenerator.generate(serviceWith([form]));
        const parsed = checkValidationErrors(
            parseContract(contract.yaml, 'form-snake.jay-contract'),
        ) as { tags: Array<{ tag: string }> };
        const fieldTags = parsed.tags.map((tag) => tag.tag);

        expect(fieldTags).toContain('firstName');
        expect(fieldTags).toContain('phoneNumber');
        expect(fieldTags).not.toContain('first_name');
        expect(fieldTags).not.toContain('phone-number');
    });
});
