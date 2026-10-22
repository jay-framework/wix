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
                <input ref="contact.email.input" />
                <select ref="contact.country.input"></select>
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
                message: 'Binding "contact.fields" uses the generic form-fields array removed in DL#38.',
                attribute: 'fields',
            }),
        ]);
    });

    it('should flag a ref to an unknown field tag (the gap core does not catch)', async () => {
        const ctx = contextWith(
            `<form><input ref="contact.phoneNumber.input" /></form>`,
            [contactImport],
        );
        const findings = await validateWixFormBindings(ctx);
        expect(findings).toEqual([
            expect.objectContaining({
                severity: 'error',
                message: 'ref="contact.phoneNumber.input" binds "phoneNumber", which is not a field of contract "form/contact".',
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
        const ctx = contextWith(`<form></form>`, [
            { key: 'contact', contractName: 'wix-form' },
        ]);
        const findings = await validateWixFormBindings(ctx);
        expect(findings).toEqual([
            expect.objectContaining({
                severity: 'error',
                message:
                    'Contract "wix-form" was removed in DL#38 — forms now use a per-form contract "form/<slug>".',
            }),
        ]);
    });

    it('should ignore pages with no wix-forms imports', async () => {
        const ctx = contextWith(`<form><input ref="other.thing" /></form>`, [
            { key: 'other', contractName: 'list/recipes', contract: { name: 'RecipesList', tags: [] } },
        ]);
        expect(await validateWixFormBindings(ctx)).toEqual([]);
    });
});
