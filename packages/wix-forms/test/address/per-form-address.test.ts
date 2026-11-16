// @vitest-environment node

/** DL #52 Phase F: F1, F1b, F2, F2b, F3, F6, F7, F8 (per-form addresses). */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/actions/forms-actions.js', () => ({
    submitForm: vi.fn(),
    getFormSummary: vi.fn(),
}));
vi.mock('@jay-framework/wix-server-client/client', () => ({
    ensureSessionFresh: vi.fn(async () => undefined),
}));

import {
    generateElementFile,
    JAY_IMPORT_RESOLVER,
    parseContract,
    parseJayFile,
} from '@jay-framework/compiler-jay-html';
import { RuntimeMode } from '@jay-framework/compiler-shared';
import { wixForm } from '../../lib/components/wix-form.js';
import { buildFormViewState } from '../../lib/components/form-view-state.js';
import { projectSubmissionValues } from '../../lib/components/submission-values.js';
import { generator as formContractGenerator } from '../../lib/generators/form-contract-generator.js';
import { buildFormsReference } from '../../lib/generators/forms-reference.js';
import { validateWixFormBindings } from '../../lib/validators/wix-form-bindings.js';
import { AddressLayoutsUnavailableError } from '../../lib/address/address-templates.js';
import { createLearnedAddressFacts } from '../../lib/address/learned-address-facts.js';
import { LAYOUT_PARTS } from '../../lib/address/address-types.js';
import { layoutOf } from '../../lib/address/address-value.js';
import { projectFormFields } from '../../lib/utils/project-form-fields.js';
import type { WixFormsService } from '../../lib/services/wix-forms-service-marker.js';
import type { FormFieldView, ListedFormView } from '../../lib/types.js';
import {
    addressFieldView,
    fixtureTemplates,
    IT_CODES,
    limitedAddressFacts,
} from '../support/address-fixtures.js';
import { rawFormFixture } from '../support/form-kinds.js';

const FIXTURE_DIR = new URL('../fixtures/address/', import.meta.url);
const ALL_PARTS = { address: [...LAYOUT_PARTS] };

function formsService(overrides: Partial<WixFormsService>): WixFormsService {
    return overrides as WixFormsService;
}

async function slowRender(
    forms: WixFormsService,
    addressParts: Record<string, string[]> | undefined = ALL_PARTS,
) {
    const props = { metadata: { formId: 'form-1', ...(addressParts ? { addressParts } : {}) } };
    return (await (wixForm as any).slowlyRender(props, forms)) as {
        rendered: Record<string, any>;
        carryForward: { fields: FormFieldView[]; loadError?: string };
    };
}

describe('F1: projection and the loaded contract', () => {
    it("projects the booking form's address as 'address' with templates, and throws without", () => {
        const raw = rawFormFixture('booking-form');
        const projected = projectFormFields(raw, {
            addressTemplates: fixtureTemplates(),
            warn: () => {},
        });
        expect(projected.fields.find((field) => field.target === 'address')?.inputType).toBe(
            'address',
        );
        expect(() => projectFormFields(raw)).toThrow('needs addressTemplates');
    });

    it('makes an address unsupported when its contract lacks a part (an older contract)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const forms = formsService({
            getFormFields: async () => ({ fields: [addressFieldView()], unsupportedFields: [] }),
        });
        const parts = LAYOUT_PARTS.filter((part) => part !== 'streetName');
        const output = await slowRender(forms, { address: parts });
        expect(output.carryForward.fields).toEqual([]);
        expect(output.rendered.loadError).toBe(
            'This form has a required field this site cannot show: Address.',
        );
        expect(warn).toHaveBeenCalledWith(
            '[wix-forms] address field "address": address contract is missing part streetName; regenerate contracts',
        );
        warn.mockRestore();
    });
});

describe('F1b: a template failure on render', () => {
    it('shows the load error, not the unsupported state', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const forms = formsService({
            getFormFields: async () => {
                throw new AddressLayoutsUnavailableError();
            },
        });
        const output = await slowRender(forms);
        expect(output.rendered.loadError).toBe(
            'Could not load the address layouts. Please try again later.',
        );
        vi.restoreAllMocks();
    });
});

describe('F2: the address view state per country', () => {
    const field = addressFieldView();
    const stateOf = (value: Record<string, string>) =>
        buildFormViewState([field], {
            isSubmitting: false,
            statusMessage: '',
            loadError: '',
            valueByTarget: { address: value },
        }).address as Record<string, any>;

    it('no country: only the country select has content', () => {
        const state = stateOf({});
        expect(state.country.options).toHaveLength(247);
        expect(LAYOUT_PARTS.map((part) => state[part].shown)).toEqual(
            LAYOUT_PARTS.map(() => false),
        );
        expect(state.subdivision.options).toEqual([]);
    });

    it('US: a listed State select of 54; IL: streets and line 2, no subdivision', () => {
        const us = stateOf({ country: 'US' });
        expect([
            us.subdivision.shown,
            us.subdivision.listed,
            us.subdivision.label,
            us.subdivision.options.length,
        ]).toEqual([true, true, 'State', 54]);
        expect(us.addressLine.maxLength).toBe(150);
        const il = stateOf({ country: 'IL' });
        expect([
            il.streetName.shown,
            il.streetNumber.shown,
            il.addressLine2.shown,
            il.subdivision.shown,
        ]).toEqual([true, true, true, false]);
    });

    it('part errors keyed <target>/<part>; the field error is the first one', () => {
        const state = buildFormViewState([field], {
            isSubmitting: false,
            statusMessage: '',
            loadError: '',
            valueByTarget: { address: { country: 'US' } },
            errorByTarget: {
                'address/city': 'City is required.',
                'address/postalCode': 'Zip / Postal code is required.',
            },
        }).address as Record<string, any>;
        expect([state.error, state.invalid, state.city.error, state.city.invalid]).toEqual([
            'City is required.',
            true,
            'City is required.',
            true,
        ]);
    });
});

/**
 * Bug: the view state carried no part order, so a page could only show parts in its own fixed
 * markup order, not the template's layout order.
 * Found in: DL #52 live QA L2. Expected: DE streetName, streetNumber, postalCode, city,
 * subdivision; JP starts with postalCode (`expected-layouts.json`). Actual: no `order` per part.
 */
describe('F2c: each shown part carries its template layout position', () => {
    const field = addressFieldView();
    const expectedLayouts = JSON.parse(
        fs.readFileSync(new URL('expected-layouts.json', FIXTURE_DIR), 'utf8'),
    );
    const templateOrder = (template: string): string[] =>
        expectedLayouts[template].fields
            .filter((part: { hidden: boolean }) => !part.hidden)
            .map((part: { part: string }) => part.part);
    const shownInOrder = (country: string): string[] => {
        const state = buildFormViewState([field], {
            isSubmitting: false,
            statusMessage: '',
            loadError: '',
            valueByTarget: { address: { country } },
        }).address as Record<string, any>;
        return LAYOUT_PARTS.filter((part) => state[part].shown).sort(
            (first, second) => state[first].order - state[second].order,
        );
    };

    it.each([
        ['DE', 'MLA_DE'],
        ['JP', 'MLA_JP'],
        ['IL', 'MLA_IL'],
    ])('%s parts sorted by order follow %s', (country, template) => {
        expect(shownInOrder(country)).toEqual(templateOrder(template));
    });

    it('a hidden part has order 0', () => {
        const state = buildFormViewState([field], {
            isSubmitting: false,
            statusMessage: '',
            loadError: '',
            valueByTarget: { address: { country: 'US' } },
        }).address as Record<string, any>;
        expect(state.streetName.order).toBe(0);
    });
});

describe('F2b: the fast phase merges the learned facts', () => {
    const carryForward = { formId: 'form-1', fields: [addressFieldView()] };
    const fast = async (forms: WixFormsService) =>
        (await (wixForm as any).fastRender({}, carryForward, forms)) as {
            rendered: Record<string, any>;
            carryForward: { fields: FormFieldView[] };
        };

    it('shows IT listed with 20 codes once the store learned them after the slow render', async () => {
        const facts = createLearnedAddressFacts();
        facts.learnSubdivisions('IT', IT_CODES);
        const output = await fast(formsService({ learnedAddressFacts: () => facts }));
        expect(layoutOf(output.carryForward.fields[0].address!, 'IT')!.subdivisions).toHaveLength(
            20,
        );
        expect(carryForward.fields[0].address!.subdivisionsOf).toEqual({});
    });

    it('leaves the spec unchanged with an empty store', async () => {
        const output = await fast(
            formsService({ learnedAddressFacts: () => createLearnedAddressFacts() }),
        );
        expect(output.carryForward.fields[0].address).toEqual(carryForward.fields[0].address);
    });
});

describe('F3: projectSubmissionValues', () => {
    it('drops a blank optional address, even with its preselected country', () => {
        const optional = addressFieldView('address_limited', limitedAddressFacts(), false);
        expect(projectSubmissionValues([optional], { address_limited: { country: 'US' } })).toEqual(
            {},
        );
        expect(projectSubmissionValues([optional], {})).toEqual({});
    });

    it('sends a non-blank one as Wix takes it', () => {
        const value = { country: 'us', city: ' Montgomery ', streetName: 'stray' };
        expect(projectSubmissionValues([addressFieldView()], { address: value })).toEqual({
            address: { country: 'US', city: 'Montgomery' },
        });
    });
});

function listedForm(field: FormFieldView): ListedFormView {
    return {
        id: 'f-addr',
        name: 'Address form',
        fields: [field],
        unsupportedFields: [],
        hasAddress: true,
    };
}

async function generatedContract(field: FormFieldView) {
    const forms = {
        config: { namespace: 'wix.form_app.form', formIds: [], include: 'enabled' },
        listForms: async () => [listedForm(field)],
    } as unknown as WixFormsService;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const [contract] = await formContractGenerator.generate(forms);
    vi.restoreAllMocks();
    return contract;
}

describe('F6: forms.yaml', () => {
    it('lists the parts and the countries (a list when ten or fewer)', () => {
        const limited = addressFieldView('address_limited', limitedAddressFacts(), false);
        const [form] = buildFormsReference([listedForm(limited)], 'wix.form_app.form').forms;
        expect(form.fields).toEqual([
            {
                tag: 'addressLimited',
                label: 'Address',
                type: 'address',
                target: 'address_limited',
                required: false,
                parts: [
                    'country',
                    'addressLine',
                    'addressLine2',
                    'streetName',
                    'streetNumber',
                    'city',
                    'subdivision',
                    'postalCode',
                ],
                countries: ['IL', 'IT', 'US'],
                valueType: 'AddressValue',
            },
        ]);
        expect(
            (buildFormsReference([listedForm(addressFieldView())], 'ns').forms[0].fields[0] as any)
                .countries,
        ).toBe(247);
    });
});

describe('F7: rule 6 and the generated contract', () => {
    const tagsOfGenerated = async (field: FormFieldView) => {
        const contract = await generatedContract(field);
        const parsed = parseContract(contract.yaml, 'generated.jay-contract');
        expect(parsed.validations).toEqual([]);
        return parsed.val!.tags as any[];
    };

    it('a US-only form still has all eight parts, and metadata says so', async () => {
        const usOnly = addressFieldView(
            'address',
            { ...limitedAddressFacts(), allowedCountries: ['US'] },
            true,
        );
        const address = (await tagsOfGenerated(usOnly)).find((tag) => tag.tag === 'address');
        expect(address.tags.map((tag: any) => tag.tag)).toEqual([
            'label',
            'required',
            'error',
            'invalid',
            'country',
            'addressLine',
            'addressLine2',
            'streetName',
            'streetNumber',
            'city',
            'subdivision',
            'postalCode',
        ]);
        expect((await generatedContract(usOnly)).metadata).toEqual({
            formId: 'f-addr',
            addressParts: { address: [...LAYOUT_PARTS] },
        });
    });

    const page = fs.readFileSync(new URL('per-form-page.jay-html', FIXTURE_DIR), 'utf8');
    const body = page.slice(page.indexOf('<body>'), page.indexOf('</body>'));

    async function findingsFor(html: string) {
        const tags = await tagsOfGenerated(addressFieldView());
        return validateWixFormBindings({
            body: parse(html),
            filePath: 'src/pages/contact/page.jay-html',
            projectRoot: '/test',
            headlessImports: [
                {
                    key: 'contact',
                    contractName: 'form/address-form',
                    contract: { name: 'AddressFormForm', tags },
                },
            ],
        });
    }

    it('passes the ✅ page', async () => {
        expect(await findingsFor(body)).toEqual([]);
    });

    it('errors on an unknown part, a missing part input, and a lone subdivision input', async () => {
        const unknown = await findingsFor(
            body.replace('</fieldset>', '<input ref="contact.address.city.text" /></fieldset>'),
        );
        expect(unknown.map((finding) => finding.message)).toContain(
            'ref="contact.address.city.text" is not an address input: unknown child under "contact.address".',
        );
        const missing = await findingsFor(
            body.replace('<input ref="contact.address.postalCode.input"', '<input'),
        );
        expect(missing.map((finding) => [finding.severity, finding.message])).toEqual([
            [
                'error',
                'The address "contact.address" has no ref="contact.address.postalCode.input": a visitor whose country needs postalCode could not fill it in.',
            ],
        ]);
        const lone = await findingsFor(body.replace('ref="contact.address.subdivision.text"', ''));
        expect(lone.map((finding) => finding.message)).toEqual([
            'The address "contact.address" has no ref="contact.address.subdivision.text": a visitor whose country needs subdivision could not fill it in.',
        ]);
    });
});

describe('F8: a generated per-form contract and the ✅ page compile', () => {
    it('compiles without validations', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wix-forms-address-'));
        fs.writeFileSync(
            path.join(dir, 'generated.jay-contract'),
            (await generatedContract(addressFieldView())).yaml,
        );
        const page = fs.readFileSync(new URL('per-form-page.jay-html', FIXTURE_DIR), 'utf8');
        const parsed = await parseJayFile(page, 'page.jay-html', dir, {}, JAY_IMPORT_RESOLVER, dir);
        expect(parsed.validations).toEqual([]);
        expect(generateElementFile(parsed.val!, RuntimeMode.MainTrusted).validations).toEqual([]);
    });
});
