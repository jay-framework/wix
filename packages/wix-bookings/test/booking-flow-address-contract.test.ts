// @vitest-environment node

/**
 * DL #52 B5 (the address contract and the ✅ page) and B8 (the booking-flow address validator).
 * The ✅ page is the log's booking-page example (`fixtures/address/booking-page.jay-html`).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import {
    generateElementFile,
    JAY_IMPORT_RESOLVER,
    parseContract,
    parseJayFile,
} from '@jay-framework/compiler-jay-html';
import { RuntimeMode, type JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import { addressFieldTag } from '@jay-framework/wix-forms';
import { validateBookingFlowBindings } from '../lib/validators/booking-flow-bindings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, 'fixtures', 'address');
const contractPath = path.join(here, '../lib/contracts/booking-flow.jay-contract');
const okPage = fs.readFileSync(path.join(fixtureDir, 'booking-page.jay-html'), 'utf8');

function tagsOf(yamlText: string, name: string): any[] {
    const parsed = parseContract(yamlText, name);
    expect(parsed.validations).toEqual([]);
    return parsed.val!.tags;
}

/** A tag tree without parser positions, for comparing structure. */
function shape(tag: any): unknown {
    return {
        tag: tag.tag,
        type: tag.type,
        dataType: tag.dataType?.name ?? tag.dataType,
        elementType: tag.elementType,
        repeated: tag.repeated ?? false,
        tags: (tag.tags ?? []).map(shape),
    };
}

describe('B5: the booking-flow address contract', () => {
    it('parses, and its address tag minus present equals the shared subtree with all eight parts', () => {
        const contract = tagsOf(fs.readFileSync(contractPath, 'utf8'), 'booking-flow.jay-contract');
        const address = contract.find((tag) => tag.tag === 'address');
        const shared = tagsOf(
            `name: Shared\ntags:\n${addressFieldTag('address', 'x')}`,
            'shared.jay-contract',
        ).find((tag) => tag.tag === 'address');
        const withoutPresent = {
            ...address,
            tags: address.tags.filter((tag: any) => tag.tag !== 'present'),
        };
        expect(shape(withoutPresent)).toEqual(shape(shared));
        expect(address.tags.map((tag: any) => tag.tag)).toEqual([
            'present',
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
    });

    it('compiles the ✅ page without validations', async () => {
        const parsed = await parseJayFile(
            okPage,
            'page.jay-html',
            fixtureDir,
            {},
            JAY_IMPORT_RESOLVER,
            fixtureDir,
        );
        expect(parsed.validations).toEqual([]);
        expect(generateElementFile(parsed.val!, RuntimeMode.MainTrusted).validations).toEqual([]);
    });
});

function projectWith(services: Array<Record<string, unknown>> | undefined): string {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wix-bookings-validator-'));
    if (services) {
        const dir = path.join(projectRoot, 'agent-kit/references/wix-bookings');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'services.yaml'), JSON.stringify({ services }));
    }
    return projectRoot;
}

function context(
    html: string,
    projectRoot: string,
    validationOverrides?: JayHtmlValidationContext['validationOverrides'],
): JayHtmlValidationContext {
    return {
        body: parse(html),
        filePath: 'src/pages/book/page.jay-html',
        projectRoot,
        headlessImports: [{ key: 'flow', contractName: 'booking-flow' }],
        ...(validationOverrides ? { validationOverrides } : {}),
    };
}

const okBody = okPage.slice(okPage.indexOf('<body>'), okPage.indexOf('</body>'));
const noAddressBody = '<body><button ref="flow.bookButton">Book</button></body>';
const ADDRESS_SERVICE = { name: 'QA Consultation', participantFormHasAddress: true };
const SUPPRESS = { 'wix-bookings': { 'allow-unbound-address': true } };

describe('B8: validateBookingFlowBindings', () => {
    const root = projectWith([ADDRESS_SERVICE]);

    it('passes the ✅ page', async () => {
        expect(await validateBookingFlowBindings(context(okBody, root))).toEqual([]);
    });

    it('errors on an unknown part ref', async () => {
        const html = okBody.replace('</div>', '<input ref="flow.address.state.input" /></div>');
        expect(await validateBookingFlowBindings(context(html, root))).toEqual([
            expect.objectContaining({
                severity: 'error',
                message:
                    'ref="flow.address.state.input" is not an address input: unknown part under "flow.address".',
            }),
        ]);
    });

    it('errors on a page without streetName.input', async () => {
        const html = okBody.replace('<input ref="flow.address.streetName.input"', '<input');
        expect(await validateBookingFlowBindings(context(html, root))).toEqual([
            expect.objectContaining({
                severity: 'error',
                message:
                    'The address "flow.address" has no ref="flow.address.streetName.input": a visitor whose country needs streetName could not fill it in.',
            }),
        ]);
    });

    it('errors on subdivision.input without subdivision.text', async () => {
        const html = okBody.replace('ref="flow.address.subdivision.text"', '');
        const findings = await validateBookingFlowBindings(context(html, root));
        expect(findings.map((finding) => [finding.severity, finding.message])).toEqual([
            [
                'error',
                'The address "flow.address" has no ref="flow.address.subdivision.text": a visitor whose country needs subdivision could not fill it in.',
            ],
        ]);
    });

    it('a page with no address refs: error naming the service that asks for one', async () => {
        expect(await validateBookingFlowBindings(context(noAddressBody, root))).toEqual([
            expect.objectContaining({
                severity: 'error',
                message:
                    'BOOKINGS-ADDRESS-UNBOUND: Service QA Consultation asks for an address, but this booking-flow page binds no address inputs. Add the address markup (wix-bookings-setup.md → Address).',
                suggestion: expect.stringContaining('allow-unbound-address: true'),
            }),
        ]);
    });

    it('a page with no address refs: nothing when every service is address-free', async () => {
        const plain = projectWith([{ name: 'Yoga', participantFormHasAddress: false }]);
        expect(await validateBookingFlowBindings(context(noAddressBody, plain))).toEqual([]);
    });

    it.each([
        ['no services.yaml', undefined],
        ['a service without the flag', [{ name: 'Old' }]],
    ])('a page with no address refs: a warning with %s', async (_name, services) => {
        const findings = await validateBookingFlowBindings(
            context(noAddressBody, projectWith(services)),
        );
        expect(findings).toEqual([
            expect.objectContaining({
                severity: 'warning',
                message:
                    'BOOKINGS-ADDRESS-UNBOUND: Cannot tell whether any service asks for an address; run `jay-stack agent-kit` to refresh services.yaml.',
            }),
        ]);
    });

    it('the suppression silences only BOOKINGS-ADDRESS-UNBOUND', async () => {
        expect(await validateBookingFlowBindings(context(noAddressBody, root, SUPPRESS))).toEqual(
            [],
        );
        const missingStreet = okBody.replace(
            '<input ref="flow.address.streetName.input"',
            '<input',
        );
        expect(
            await validateBookingFlowBindings(context(missingStreet, root, SUPPRESS)),
        ).toHaveLength(1);
    });

    it('ignores pages that do not import booking-flow', async () => {
        const ctx = { ...context(noAddressBody, root), headlessImports: [] };
        expect(await validateBookingFlowBindings(ctx)).toEqual([]);
    });
});
