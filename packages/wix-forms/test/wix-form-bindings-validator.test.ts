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
                    <span id="email-error">{contact.email.error}</span>
                    <input ref="contact.firstName.input" aria-label="First name" required />
                    <p role="status" aria-live="polite" class="visually-hidden">{contact.statusMessage}</p>
                <button ref="contact.submitButton">Send</button></form>`,
            ),
        ).toEqual([]);
    });

    /**
     * Bug: a per-field live error is read a second time now that the plugin announces blur
     * errors through statusMessage (DL #59, Phase 0: per-field aria-live redundant).
     * Expected: a warning on an element whose own text binds {key.field.error} and is live.
     */
    describe('a live per-field error element (DL #59)', () => {
        const page = (errorElement: string) =>
            `<form novalidate>
                <label for="email">{contact.email.label}</label>
                <input id="email" ref="contact.email.input" aria-describedby="email-error" />
                ${errorElement}
                <p role="status" aria-live="polite" class="visually-hidden">{contact.statusMessage}</p>
            <button ref="contact.submitButton">Send</button></form>`;

        it.each([
            ['aria-live', `<span id="email-error" aria-live="polite">{contact.email.error}</span>`],
            ['role', `<span id="email-error" role="alert">{contact.email.error}</span>`],
            ['role', `<span id="email-error" role="status">{contact.email.error}</span>`],
            ['role', `<span id="email-error" role="log">{contact.email.error}</span>`],
        ])('should warn once on a live error element (%s): %s', async (attribute, element) => {
            expect(await warningsFor(page(element))).toEqual([
                {
                    severity: 'warning',
                    attribute,
                    message:
                        '"{contact.email.error}" is on a live element (aria-live / role), so a blur error is announced twice — wix-forms already announces it through statusMessage.',
                    suggestion:
                        'Remove aria-live from the error element; keep it linked from the input with aria-describedby, and bind {contact.statusMessage} to an always-present role="status" region.',
                },
            ]);
        });

        it.each([
            [
                'aria-live="off"',
                `<span id="email-error" aria-live="off">{contact.email.error}</span>`,
            ],
            ['no live attribute', `<span id="email-error">{contact.email.error}</span>`],
            [
                'a live ancestor',
                `<div aria-live="polite"><span id="email-error">{contact.email.error}</span></div>`,
            ],
        ])('should not warn on %s', async (_case, element) => {
            expect(await warningsFor(page(element))).toEqual([]);
        });

        /**
         * Bug: the warning read only the live element's own text nodes, so an error rendered in
         * child `if` spans was never flagged (15 such paragraphs missed on one site).
         * Found in: a consumer-site upgrade QA (0.26.5), 2026-11-17.
         * Expected: a live error element warns when its error binding or errorRule branches sit
         * in descendants; a live region holding no field error stays silent.
         * Actual: no warning for the `if`-span pattern.
         */
        describe('error text in descendant elements', () => {
            const fragment = (name: string) =>
                readFile(path.join(fixturesDir, 'live-error-subtree', name), 'utf-8');

            it.each([
                ['aria-live', 'if-span-error.jay-html.fragment'],
                ['role', 'static-error-rule-span.jay-html.fragment'],
            ])('should warn once (%s) on %s', async (attribute, name) => {
                expect(await warningsFor(await fragment(name))).toEqual([
                    {
                        severity: 'warning',
                        attribute,
                        message:
                            '"{contact.email.error}" is on a live element (aria-live / role), so a blur error is announced twice — wix-forms already announces it through statusMessage.',
                        suggestion:
                            'Remove aria-live from the error element; keep it linked from the input with aria-describedby, and bind {contact.statusMessage} to an always-present role="status" region.',
                    },
                ]);
            });

            it('should not warn on a live region that holds no field error', async () => {
                expect(
                    await warningsFor(await fragment('status-region-only.jay-html.fragment')),
                ).toEqual([]);
            });
        });
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

/**
 * DL #60: field autocomplete, aria-invalid and error-linkage rules. Expected findings are written
 * from the design log (Design §3 message format), not from code runs. Each fixture is otherwise a
 * clean page, so the full finding list is compared.
 */
describe('validateWixFormBindings — DL #60 field autocomplete, aria-invalid and error linkage', () => {
    const FIELD_CHANNELS = [
        'label',
        'placeholder',
        'value',
        'required',
        'error',
        'invalid',
        'errorRule',
        'input',
        'control',
    ];
    const field = (tag: string, meta?: Record<string, string>, extra: object[] = []) => ({
        tag,
        type: [] as number[],
        ...(meta && { meta }),
        tags: [...FIELD_CHANNELS.map((channel) => ({ tag: channel })), ...extra],
    });
    const ADDRESS_PARTS_TAGS = [
        'country',
        'streetName',
        'streetNumber',
        'addressLine',
        'addressLine2',
        'city',
        'subdivision',
        'postalCode',
    ];
    const DL60_TAGS = [
        field('firstName', { kind: 'text', target: 'first_name' }),
        field('lastName', { kind: 'text', target: 'last_name' }),
        field('email', { kind: 'email', target: 'email' }),
        field('phone', { kind: 'tel', target: 'phone' }),
        field('message', undefined),
        field('interests', { kind: 'multiselect', target: 'interests' }, [
            {
                tag: 'options',
                tags: [{ tag: 'value' }, { tag: 'label' }, { tag: 'selected' }, { tag: 'toggle' }],
            },
        ]),
        ...[
            'submitButton',
            'resetButton',
            'confirmation',
            'statusMessage',
            'isSubmitted',
            'isSubmitting',
            'loadError',
        ].map((tag) => ({ tag, type: [] as number[] })),
    ];
    const ADDRESS_TAG = {
        tag: 'address',
        type: [] as number[],
        tags: [
            { tag: 'label' },
            { tag: 'error' },
            { tag: 'invalid' },
            ...ADDRESS_PARTS_TAGS.map((part) => ({ tag: part })),
        ],
    };
    const dl60Import = (tags: object[] = DL60_TAGS) => ({
        key: 'contact',
        contractName: 'form/contact',
        contract: { name: 'ContactForm', tags: tags as any },
    });

    const SEE = 'See: wix-forms rich-forms.md §6.';
    const suppress = (rule: string) =>
        `Suppress with wix-forms: { allow-${rule}: true } in <script type="application/jay-validations">.`;

    async function findingsFor(
        name: string,
        options: { tags?: object[]; overrides?: Record<string, boolean> } = {},
    ) {
        const html = await readFile(path.join(fixturesDir, 'dl60-field-a11y', name), 'utf-8');
        const ctx = contextWith(html, [dl60Import(options.tags)]);
        if (options.overrides) ctx.validationOverrides = { 'wix-forms': options.overrides };
        return validateWixFormBindings(ctx);
    }

    describe('wix-forms/field-autocomplete', () => {
        it('should warn on a bound email input with no type and no autocomplete (test 2)', async () => {
            expect(await findingsFor('email-no-autocomplete.jay-html.fragment')).toEqual([
                {
                    severity: 'warning',
                    attribute: 'ref',
                    message:
                        '[wix-forms/field-autocomplete] ref="contact.email.input" (Wix email field "email") has no autocomplete, so the browser cannot autofill it.',
                    suggestion: `Add autocomplete="email". ${suppress('field-autocomplete')} ${SEE}`,
                },
            ]);
        });

        it.each([
            ['type="email" (test 3)', 'email-type-no-autocomplete.jay-html.fragment'],
            ['type="tel" (test 3b)', 'tel-type-no-autocomplete.jay-html.fragment'],
        ])('should leave a missing token on a %s input to the generic rule', async (_, name) => {
            expect(await findingsFor(name)).toEqual([]);
        });

        it('should error on a valid but wrong token (test 4)', async () => {
            expect(await findingsFor('email-wrong-token.jay-html.fragment')).toEqual([
                {
                    severity: 'error',
                    attribute: 'autocomplete',
                    message:
                        '[wix-forms/field-autocomplete] ref="contact.email.input" (Wix email field "email") has autocomplete="name"; the browser will fill a name into it.',
                    suggestion: `Use autocomplete="email". ${suppress('field-autocomplete')} ${SEE}`,
                },
            ]);
        });

        it.each([
            ['a shipping prefix (test 5)', 'email-shipping-prefix.jay-html.fragment'],
            ['tel-national on a tel field (test 18)', 'tel-national.jay-html.fragment'],
            ['a text field without meta (test 8)', 'text-field-no-meta.jay-html.fragment'],
        ])('should accept %s', async (_, name) => {
            expect(await findingsFor(name)).toEqual([]);
        });

        it('should suggest given-name for the first_name target (test 6)', async () => {
            expect(await findingsFor('first-name-no-autocomplete.jay-html.fragment')).toEqual([
                {
                    severity: 'warning',
                    attribute: 'ref',
                    message:
                        '[wix-forms/field-autocomplete] ref="contact.firstName.input" (Wix field "first_name") has no autocomplete, so the browser cannot autofill it.',
                    suggestion: `Add autocomplete="given-name". ${suppress('field-autocomplete')} ${SEE}`,
                },
            ]);
        });

        /**
         * Found at the QA testbed (DL #60 V1): Wix suffixes generated field keys, so a real
         * first-name field's target is `first_name_5820`, not `first_name`.
         * Expected: the suffixed target maps to given-name like the bare one.
         */
        it('should suggest given-name for a suffixed first_name_<hex> target', async () => {
            const tags = [
                field('firstName', { kind: 'text', target: 'first_name_5820' }),
                ...DL60_TAGS.slice(1),
            ];
            expect(
                (await findingsFor('first-name-no-autocomplete.jay-html.fragment', { tags })).map(
                    (finding) => finding.suggestion?.split('.')[0],
                ),
            ).toEqual(['Add autocomplete="given-name"']);
        });

        it('should error on address-line1 on an address streetName (test 7)', async () => {
            expect(
                await findingsFor('address-street-wrong-token.jay-html.fragment', {
                    tags: [ADDRESS_TAG, { tag: 'submitButton', type: [] }],
                }),
            ).toEqual([
                {
                    severity: 'error',
                    attribute: 'autocomplete',
                    message:
                        '[wix-forms/field-autocomplete] ref="contact.address.streetName.input" (address part "streetName") has autocomplete="address-line1"; the browser will fill a street address line into it.',
                    suggestion: `Remove the autocomplete: streetName has no standard token. ${suppress('field-autocomplete')} ${SEE}`,
                },
            ]);
        });

        it('should check an address part inside if=, without meta (test 22)', async () => {
            expect(
                await findingsFor('address-city-conditional-no-token.jay-html.fragment', {
                    tags: [ADDRESS_TAG, { tag: 'submitButton', type: [] }],
                }),
            ).toEqual([
                {
                    severity: 'warning',
                    attribute: 'ref',
                    message:
                        '[wix-forms/field-autocomplete] ref="contact.address.city.input" (address part "city") has no autocomplete, so the browser cannot autofill it.',
                    suggestion: `Add autocomplete="address-level2". ${suppress('field-autocomplete')} ${SEE}`,
                },
            ]);
        });
    });

    describe('wix-forms/field-invalid-unbound', () => {
        const SUGGESTION = `Use aria-invalid="{contact.email.invalid}". ${suppress('field-invalid-unbound')} ${SEE}`;

        it.each([
            [
                'missing (test 9)',
                'email-no-aria-invalid.jay-html.fragment',
                'ref',
                '[wix-forms/field-invalid-unbound] ref="contact.email.input" has no aria-invalid bound to the field\'s invalid state, so screen readers never say "invalid".',
            ],
            [
                'static "true" (test 10)',
                'email-static-aria-invalid.jay-html.fragment',
                'aria-invalid',
                '[wix-forms/field-invalid-unbound] ref="contact.email.input" has a static aria-invalid="true"; it must follow the field\'s invalid state, so screen readers say "invalid" before the visitor typed anything.',
            ],
            [
                'static "false"',
                'email-false-aria-invalid.jay-html.fragment',
                'aria-invalid',
                '[wix-forms/field-invalid-unbound] ref="contact.email.input" has a static aria-invalid="false"; it must follow the field\'s invalid state, so screen readers never say "invalid".',
            ],
            [
                "another field's state (test 10)",
                'email-other-field-aria-invalid.jay-html.fragment',
                'aria-invalid',
                '[wix-forms/field-invalid-unbound] ref="contact.email.input" has aria-invalid="{contact.firstName.invalid}", which is another field\'s state; it must be {contact.email.invalid}.',
            ],
        ])('should warn when aria-invalid is %s', async (_, name, attribute, message) => {
            expect(await findingsFor(name)).toEqual([
                { severity: 'warning', attribute, message, suggestion: SUGGESTION },
            ]);
        });

        it('should accept {$parent.…invalid} on chip toggles, linked from the fieldset (test 11)', async () => {
            expect(await findingsFor('chips.jay-html.fragment')).toEqual([]);
        });
    });

    describe('wix-forms/field-error-undescribed', () => {
        it('should warn on an always-present error element with no id (test 12)', async () => {
            expect(await findingsFor('error-no-id.jay-html.fragment')).toEqual([
                {
                    severity: 'warning',
                    message:
                        '[wix-forms/field-error-undescribed] <span> showing {contact.email.error} inside ref="emailRow" has no id, so ref="contact.email.input" cannot point aria-describedby at it; the error is not read when the field is focused.',
                    suggestion: `Give it id="contact-email-error" and add aria-describedby="contact-email-error" to the input. ${suppress('field-error-undescribed')} ${SEE}`,
                },
            ]);
        });

        it("should warn when the error id is not in the input's aria-describedby", async () => {
            expect(await findingsFor('error-not-listed.jay-html.fragment')).toEqual([
                {
                    severity: 'warning',
                    message:
                        '[wix-forms/field-error-undescribed] <span id="contact-email-error"> showing {contact.email.error} is not in ref="contact.email.input"\'s aria-describedby, so the error is not read when the field is focused.',
                    suggestion: `Add "contact-email-error" to the input's aria-describedby. ${suppress('field-error-undescribed')} ${SEE}`,
                },
            ]);
        });

        it('should warn on an unlinked always-present wrapper of errorRule branches (test 20)', async () => {
            expect(await findingsFor('error-rule-wrapper-unlinked.jay-html.fragment')).toEqual([
                {
                    severity: 'warning',
                    message:
                        '[wix-forms/field-error-undescribed] <p> showing contact.email.errorRule branches has no id, so ref="contact.email.input" cannot point aria-describedby at it; the error is not read when the field is focused.',
                    suggestion: `Give it id="contact-email-error" and add aria-describedby="contact-email-error" to the input. ${suppress('field-error-undescribed')} ${SEE}`,
                },
            ]);
        });

        it.each([
            ['a linked error span (test 13)', 'good-email.jay-html.fragment'],
            ['an error element under if= (test 14)', 'error-conditional.jay-html.fragment'],
            ['a bound aria-describedby (test 19)', 'bound-describedby.jay-html.fragment'],
            ['a bound error id (test 19)', 'bound-error-id.jay-html.fragment'],
            ['a linked errorRule wrapper (test 21)', 'error-rule-wrapper-linked.jay-html.fragment'],
        ])('should stay silent on %s', async (_, name) => {
            expect(await findingsFor(name)).toEqual([]);
        });
    });

    it('should report the three rules on the Problem page, one per rule', async () => {
        const rules = (await findingsFor('problem-page.jay-html.fragment')).map(
            (finding) => finding.message.match(/^\[([^\]]+)\]/)?.[1],
        );
        expect(rules).toEqual([
            'wix-forms/field-autocomplete',
            'wix-forms/field-invalid-unbound',
            'wix-forms/field-error-undescribed',
        ]);
    });

    it.each(['field-autocomplete', 'field-invalid-unbound', 'field-error-undescribed'])(
        'should drop only %s when allow-<rule-id> is set (test 15)',
        async (rule) => {
            const rules = (
                await findingsFor('problem-page.jay-html.fragment', {
                    overrides: { [`allow-${rule}`]: true },
                })
            ).map((finding) => finding.message.match(/^\[wix-forms\/([^\]]+)\]/)?.[1]);
            expect(rules).toEqual(
                ['field-autocomplete', 'field-invalid-unbound', 'field-error-undescribed'].filter(
                    (id) => id !== rule,
                ),
            );
        },
    );

    it('should pass the rich-forms §1 example with zero findings (test 16)', async () => {
        expect(await findingsFor('rich-forms-section-1.jay-html.fragment')).toEqual([]);
    });
});
