// @vitest-environment node

import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import { validateWixFormBindings } from '../lib/validators/wix-form-bindings.js';

const CONTACT_TAGS = [
    { tag: 'firstName', type: [] as number[] },
    { tag: 'email', type: [] as number[] },
    { tag: 'country', type: [] as number[] },
    { tag: 'isLoading', type: [] as number[] },
    { tag: 'loadError', type: [] as number[] },
    { tag: 'isSubmitting', type: [] as number[] },
    { tag: 'statusMessage', type: [] as number[] },
    { tag: 'submitButton', type: [] as number[] },
];

function contextWith(
    html: string,
    headlessImports: JayHtmlValidationContext['headlessImports'],
): JayHtmlValidationContext {
    return {
        body: parse(html),
        filePath: 'src/pages/contact/page.jay-html',
        projectRoot: '/test',
        headlessImports,
    };
}

const contactImport = {
    key: 'contact',
    contractName: 'form/contact',
    contract: { name: 'ContactForm', tags: CONTACT_TAGS },
};

describe('validateWixFormBindings', () => {
    it('should pass a page that binds explicit per-form field tags', async () => {
        const ctx = contextWith(
            `<form>
                <label>{contact.email.label} <input ref="contact.email.input" /></label>
                <label>{contact.country.label} <select ref="contact.country.input"></select></label>
                <button ref="contact.submitButton">Send</button>
            </form>`,
            [contactImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([]);
    });

    it('should flag a leftover generic .fields binding on a migrated per-form import', async () => {
        const ctx = contextWith(
            `<form><label forEach="contact.fields" trackBy="target">{label}</label></form>`,
            [contactImport],
        );
        const findings = await validateWixFormBindings(ctx);
        expect(findings).toEqual([
            expect.objectContaining({
                severity: 'error',
                message:
                    'Binding "contact.fields" is invalid — the generic ".fields" array was removed; use explicit field tags (e.g. "contact.email.label").',
                attribute: 'fields',
            }),
        ]);
    });

    it('should flag a ref to an unknown field tag (the gap core does not catch)', async () => {
        const ctx = contextWith(
            `<form><label>Phone <input ref="contact.phoneNumber.input" /></label></form>`,
            [contactImport],
        );
        const findings = await validateWixFormBindings(ctx);
        expect(findings).toEqual([
            expect.objectContaining({
                severity: 'error',
                message:
                    'ref="contact.phoneNumber.input" binds "phoneNumber", which is not a field of contract "form/contact".',
                attribute: 'ref',
            }),
        ]);
    });

    it('should not flag refs to reserved form-level tags', async () => {
        const ctx = contextWith(`<form><button ref="contact.submitButton"></button></form>`, [
            contactImport,
        ]);
        expect(await validateWixFormBindings(ctx)).toEqual([]);
    });

    it('should emit a migration message for the retired contract="wix-form" import', async () => {
        const ctx = contextWith(`<form></form>`, [{ key: 'contact', contractName: 'wix-form' }]);
        const findings = await validateWixFormBindings(ctx);
        expect(findings).toEqual([
            expect.objectContaining({
                severity: 'error',
                message:
                    'Contract "wix-form" is no longer supported — import a per-form contract "form/<slug>" instead.',
            }),
        ]);
    });

    it('should ignore pages with no wix-forms imports', async () => {
        const ctx = contextWith(`<form><input ref="other.thing" /></form>`, [
            {
                key: 'other',
                contractName: 'list/recipes',
                contract: { name: 'RecipesList', tags: [] },
            },
        ]);
        expect(await validateWixFormBindings(ctx)).toEqual([]);
    });
});

describe('validateWixFormBindings — DL#41 second-segment ref check (gate iv)', () => {
    // A contract whose field sub-contracts carry NESTED tags, as the real validation context may.
    const nestedImport = {
        key: 'contact',
        contractName: 'form/contact',
        contract: {
            name: 'ContactForm',
            tags: [
                {
                    tag: 'email',
                    type: [] as number[],
                    tags: [
                        { tag: 'label' },
                        { tag: 'value' },
                        { tag: 'required' },
                        { tag: 'error' },
                        { tag: 'invalid' },
                        { tag: 'input' },
                        { tag: 'control' },
                    ],
                },
                { tag: 'submitButton', type: [] as number[] },
            ],
        },
    };

    it('should flag an unknown second-segment channel when nested tags are present', async () => {
        const ctx = contextWith(
            `<form><button ref="contact.email.bogus" data-value="x"></button></form>`,
            [nestedImport],
        );
        const findings = await validateWixFormBindings(ctx);
        expect(findings).toEqual([
            expect.objectContaining({
                severity: 'error',
                message:
                    'ref="contact.email.bogus" binds "email.bogus", which is not a channel of field "email".',
                attribute: 'ref',
            }),
        ]);
    });

    it('should accept a known .control second-segment channel', async () => {
        const ctx = contextWith(
            `<form><button ref="contact.email.control" data-value="x"></button></form>`,
            [nestedImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([]);
    });

    it('should NOT flag a second segment when nested tags are unavailable (first-segment fallback)', async () => {
        // The flat CONTACT_TAGS import carries no nested tags → the fallback holds, no finding.
        const ctx = contextWith(
            `<form><button ref="contact.email.bogus" data-value="x"></button></form>`,
            [contactImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([]);
    });
});

describe('validateWixFormBindings — accessibility warnings (DL#41 Addendum A)', () => {
    function warningsFor(html: string) {
        return validateWixFormBindings(contextWith(html, [contactImport]));
    }

    it('should accept the accessible pattern', async () => {
        expect(
            await warningsFor(
                `<form novalidate>
                    <label for="email">{contact.email.label}</label>
                    <input id="email" ref="contact.email.input" aria-required="{contact.email.required}"
                           aria-describedby="email-error" />
                    <span id="email-error" aria-live="polite">{contact.email.error}</span>
                    <input ref="contact.firstName.input" aria-label="First name" required />
                </form>`,
            ),
        ).toEqual([]);
    });

    it('should warn on a field input with no accessible label', async () => {
        expect(await warningsFor(`<form><input ref="contact.email.input" /></form>`)).toEqual([
            expect.objectContaining({
                severity: 'warning',
                message: 'ref="contact.email.input" has no accessible label.',
            }),
        ]);
    });

    it('should warn when a <label> contains the field error binding', async () => {
        expect(
            await warningsFor(
                `<form><label>{contact.email.label} <input ref="contact.email.input" />
                    <span>{contact.email.error}</span></label></form>`,
            ),
        ).toEqual([
            expect.objectContaining({
                severity: 'warning',
                message:
                    '<label> contains the error binding "{contact.email.error}", so the error text becomes part of the field\'s accessible name.',
            }),
        ]);
    });

    it('should warn on native required inside a <form> without novalidate', async () => {
        expect(
            await warningsFor(
                `<form><label>{contact.email.label} <input ref="contact.email.input" required /></label></form>`,
            ),
        ).toEqual([
            expect.objectContaining({
                severity: 'warning',
                attribute: 'required',
            }),
        ]);
    });
});
