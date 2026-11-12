// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import { validateWixFormBindings } from '../lib/validators/wix-form-bindings.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

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
            `<form><label>Phone <input ref="contact.phoneNumber.input" /></label><button ref="contact.submitButton">Send</button></form>`,
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
            `<form><button ref="contact.email.bogus" data-value="x"></button><button ref="contact.submitButton">Send</button></form>`,
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
            `<form><button ref="contact.email.control" data-value="x"></button><button ref="contact.submitButton">Send</button></form>`,
            [nestedImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([]);
    });

    it('should NOT flag a second segment when nested tags are unavailable (first-segment fallback)', async () => {
        // The flat CONTACT_TAGS import carries no nested tags → the fallback holds, no finding.
        const ctx = contextWith(
            `<form><button ref="contact.email.bogus" data-value="x"></button><button ref="contact.submitButton">Send</button></form>`,
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
                <button ref="contact.submitButton">Send</button></form>`,
            ),
        ).toEqual([]);
    });

    it('should warn on a field input with no accessible label', async () => {
        expect(
            await warningsFor(
                `<form><input ref="contact.email.input" /><button ref="contact.submitButton">Send</button></form>`,
            ),
        ).toEqual([
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
                    <span>{contact.email.error}</span></label><button ref="contact.submitButton">Send</button></form>`,
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
                `<form><label>{contact.email.label} <input ref="contact.email.input" required /></label><button ref="contact.submitButton">Send</button></form>`,
            ),
        ).toEqual([
            expect.objectContaining({
                severity: 'warning',
                attribute: 'required',
            }),
        ]);
    });
});

describe('validateWixFormBindings — unguarded <form> (DL#44 rule 3)', () => {
    const unguardedWarning = expect.objectContaining({
        severity: 'warning',
        message:
            'A <form> holds "contact" refs but no ref="contact.submitButton", so its native submit is not intercepted and reloads the page.',
    });

    it('should warn when a <form> holds contact.firstName.input but no contact.submitButton', async () => {
        const ctx = contextWith(
            `<form novalidate><label>{contact.firstName.label} <input ref="contact.firstName.input" /></label><button>Send</button></form>`,
            [contactImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([unguardedWarning]);
    });

    it('should stay silent when the <form> contains ref="contact.submitButton"', async () => {
        const ctx = contextWith(
            `<form novalidate><label>{contact.firstName.label} <input ref="contact.firstName.input" /></label><button ref="contact.submitButton">Send</button></form>`,
            [contactImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([]);
    });

    it('should stay silent when the key refs have no enclosing <form>', async () => {
        const ctx = contextWith(
            `<div><label>{contact.firstName.label} <input ref="contact.firstName.input" /></label><button ref="contact.submitButton">Send</button></div>`,
            [contactImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([]);
    });

    it('should warn once for several contact refs in the same <form>', async () => {
        const ctx = contextWith(
            `<form novalidate>
                <label>{contact.firstName.label} <input ref="contact.firstName.input" /></label>
                <label>{contact.email.label} <input ref="contact.email.input" /></label>
            </form>`,
            [contactImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([unguardedWarning]);
    });
});

describe('validateWixFormBindings — option refs (DL#44 rules 1 and 2)', () => {
    const optionTags = (...extra: string[]) => ['value', 'label', ...extra].map((tag) => ({ tag }));
    const choicesImport = {
        key: 'contact',
        contractName: 'form/choices',
        contract: {
            name: 'ChoicesForm',
            tags: [
                {
                    tag: 'consent',
                    type: [] as number[],
                    tags: [
                        { tag: 'label' },
                        { tag: 'value' },
                        { tag: 'input' },
                        { tag: 'control' },
                    ],
                },
                {
                    tag: 'interests',
                    type: [] as number[],
                    tags: [
                        { tag: 'label' },
                        { tag: 'required' },
                        { tag: 'error' },
                        { tag: 'invalid' },
                        { tag: 'input' },
                        { tag: 'control' },
                        { tag: 'options', tags: optionTags('selected', 'toggle') },
                    ],
                },
                {
                    tag: 'country',
                    type: [] as number[],
                    tags: [
                        { tag: 'label' },
                        { tag: 'input' },
                        { tag: 'control' },
                        { tag: 'options', tags: optionTags() },
                    ],
                },
                { tag: 'submitButton', type: [] as number[] },
            ],
        },
    };

    it('should accept the rich-forms §4b checkbox-chip example', async () => {
        const chipGroup = await readFile(
            path.join(fixturesDir, 'checkbox-chips', 'chip-group.jay-html.fragment'),
            'utf-8',
        );
        expect(await validateWixFormBindings(contextWith(chipGroup, [choicesImport]))).toEqual([]);
    });

    it('should flag options.toggle on a single select, whose options have no toggle', async () => {
        const ctx = contextWith(
            `<form><label forEach="contact.country.options" trackBy="value"><input type="checkbox" ref="contact.country.options.toggle" /> {label}</label><button ref="contact.submitButton">Send</button></form>`,
            [choicesImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([
            expect.objectContaining({
                severity: 'error',
                message:
                    'ref="contact.country.options.toggle" binds "country.options.toggle", which is not a tag of the options of field "country".',
                attribute: 'ref',
            }),
        ]);
    });

    it('should NOT flag an option ref when the nested option tags are unavailable', async () => {
        const ctx = contextWith(
            `<form><input type="checkbox" ref="contact.country.options.toggle" /><button ref="contact.submitButton">Send</button></form>`,
            [contactImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([]);
    });

    it('should warn on .control inside forEach over a multiselect options', async () => {
        const ctx = contextWith(
            `<form><label forEach="contact.interests.options" trackBy="value"><input type="checkbox" ref="contact.interests.control" data-value="{value}" /> {label}</label><button ref="contact.submitButton">Send</button></form>`,
            [choicesImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([
            expect.objectContaining({
                severity: 'warning',
                message:
                    'ref="contact.interests.control" inside forEach="contact.interests.options" stores a single value, so each click replaces the selection instead of toggling one option.',
                suggestion: 'Bind each checkbox with ref="contact.interests.options.toggle".',
                attribute: 'ref',
            }),
        ]);
    });

    it('should warn when the .control element itself carries the forEach over options', async () => {
        const ctx = contextWith(
            `<form><input type="checkbox" forEach="contact.interests.options" trackBy="value" ref="contact.interests.control" data-value="{value}" /><button ref="contact.submitButton">Send</button></form>`,
            [choicesImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([
            expect.objectContaining({ severity: 'warning', attribute: 'ref' }),
        ]);
    });

    it('should accept .control outside a forEach over options', async () => {
        const ctx = contextWith(
            `<form><button ref="contact.interests.control" data-value="a">A</button><button ref="contact.submitButton">Send</button></form>`,
            [choicesImport],
        );
        expect(await validateWixFormBindings(ctx)).toEqual([]);
    });
});

/**
 * Bug: P1c makes a phone field newly produce PHONE_COUNTRY; a page that shows its error only under
 *   an `errorRule === PHONE` branch shows nothing for it (DL#55 P1c, validator warning 6).
 * Found in: design-log/55 - wix validation parity for wix-forms.md §1c "Plugin validation"
 * Expected: a located warning when a field branches on PHONE, not on PHONE_COUNTRY, and has no
 *   unconditional `{key.field.error}` text binding; unrecognised conditions stay silent.
 */
describe('validateWixFormBindings — PHONE without PHONE_COUNTRY (DL#55 P1c warning 6)', () => {
    const phoneCountryWarning = expect.objectContaining({
        severity: 'warning',
        message:
            '`contact.phone` branches on errorRule PHONE but not PHONE_COUNTRY: a phone without a country code would show no error. Add a PHONE_COUNTRY branch or print {contact.phone.error} unconditionally (DL#55 P1c).',
    });

    function findingsFor(html: string) {
        return validateWixFormBindings(contextWith(html, [contactImport]));
    }

    it('should warn on a PHONE-only branch', async () => {
        expect(
            await findingsFor(
                `<div><span if="contact.phone.errorRule === PHONE">{contact.phone.error}</span></div>`,
            ),
        ).toEqual([phoneCountryWarning]);
    });

    it('should stay silent with a PHONE_COUNTRY branch', async () => {
        expect(
            await findingsFor(
                `<div><span if="contact.phone.errorRule === PHONE">Bad phone</span>
                 <span if="contact.phone.errorRule === PHONE_COUNTRY">Add +</span></div>`,
            ),
        ).toEqual([]);
    });

    it('should stay silent with an unconditional error binding', async () => {
        expect(
            await findingsFor(
                `<div><span if="contact.phone.errorRule === PHONE">Bad phone</span>
                 <span>{contact.phone.error}</span></div>`,
            ),
        ).toEqual([]);
    });

    it('should warn when the only unconditional error expression is an attribute', async () => {
        expect(
            await findingsFor(
                `<div aria-label="{contact.phone.error}"><span if="contact.phone.errorRule === PHONE">Bad phone</span></div>`,
            ),
        ).toEqual([phoneCountryWarning]);
    });

    it('should warn when the error binding is nested two levels inside a PHONE branch', async () => {
        expect(
            await findingsFor(
                `<div if="contact.phone.errorRule === PHONE"><p><b>{contact.phone.error}</b></p></div>`,
            ),
        ).toEqual([phoneCountryWarning]);
    });

    it('should stay silent on a compound condition it does not recognise', async () => {
        expect(
            await findingsFor(
                `<div><span if="contact.phone.errorRule === PHONE || contact.phone.errorRule === SERVER">{contact.phone.error}</span></div>`,
            ),
        ).toEqual([]);
    });

    it('should warn on the == spelling', async () => {
        expect(
            await findingsFor(
                `<div><span if="contact.phone.errorRule == PHONE">{contact.phone.error}</span></div>`,
            ),
        ).toEqual([phoneCountryWarning]);
    });
});
