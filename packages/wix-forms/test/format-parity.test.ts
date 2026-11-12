// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFormField, validateFormSummaryField } from '../lib/utils/project-form-fields.js';
import type { FormFieldSummaryView, FormFieldView } from '../lib/types.js';
import { FieldRule } from '../lib/components/field-rule.js';
import { checkPhone } from '../lib/utils/phone-normalization.js';
import type { PhoneRules } from '../lib/types.js';

/**
 * Bug: the browser's format rules were stricter than Wix's server (DL#55 Problem 1), so values
 *   Wix stores (`054.123.4567`, `HTTPS://EXAMPLE.COM`, …) were blocked with no way out.
 * Found in: design-log/55 - wix validation parity for wix-forms.md §Phase 1
 * Expected: every value the L1/L1b captures show Wix accepting passes `checkFormField`.
 * Oracle: the checked-in live captures (test/fixtures/format-parity/README.md).
 */

interface CapturedProbe {
    label: string;
    sent: Record<string, unknown>;
    response?: {
        details?: {
            validationError?: {
                fieldViolations?: Array<{ data?: { errors?: Array<{ errorPath?: string }> } }>;
            };
        };
    };
}

const FIXTURES = resolve(__dirname, 'fixtures/format-parity');
const TARGET_OF_PROBE_KIND: Record<string, string> = {
    phone: 'phone',
    url: 'website',
    email: 'email',
};

const fields: FormFieldView[] = JSON.parse(
    readFileSync(resolve(FIXTURES, 'qa-test-dl54-fields.json'), 'utf8'),
);

const probes = ['wix-l1-probes-2026-11-11.json', 'wix-l1b-probes-2026-11-11.json'].flatMap((file) =>
    formatProbesOf(JSON.parse(readFileSync(resolve(FIXTURES, file), 'utf8')).results),
);

/** Only `phone `/`url `/`email ` labels are format probes; required/enum/type/unknown-key and `cleanProbes` are skipped. */
function formatProbesOf(results: CapturedProbe[]) {
    return results.flatMap((probe) => {
        const kind = probe.label.split(' ')[0];
        const target = TARGET_OF_PROBE_KIND[kind];
        if (!target) return [];
        return [
            {
                target,
                value: String(probe.sent[target]),
                wixAccepted: !refusedTarget(probe, target),
            },
        ];
    });
}

function refusedTarget(probe: CapturedProbe, target: string): boolean {
    const violations = probe.response?.details?.validationError?.fieldViolations ?? [];
    return violations.some((violation) =>
        (violation.data?.errors ?? []).some((error) => error.errorPath === target),
    );
}

function fieldOf(target: string): FormFieldView {
    const field = fields.find((candidate) => candidate.target === target);
    if (!field) throw new Error(`no "${target}" field in qa-test-dl54-fields.json`);
    return field;
}

const RULE_OF_TARGET: Record<string, FieldRule> = {
    phone: FieldRule.PHONE,
    website: FieldRule.URL,
    email: FieldRule.EMAIL,
};

function probedValue(target: string, value: string) {
    const probe = probes.find(
        (candidate) => candidate.target === target && candidate.value === value,
    );
    if (!probe) throw new Error(`"${value}" (${target}) is not in the captures`);
    return probe;
}

describe('format parity with Wix (DL#55 P1)', () => {
    it('should read the format probes from the captures', () => {
        expect(probes.length).toBe(34 + 4); // L1 + L1b format probes
    });

    // (a) Email / URL only since DL#55 P1c: for phones the oracle is the caller path (block below).
    it.each(probes.filter((probe) => probe.wixAccepted && probe.target !== 'phone'))(
        'should accept $target "$value", which Wix accepts',
        ({ target, value }) => {
            expect(checkFormField(fieldOf(target), value).rule).toBe(FieldRule.NONE);
        },
    );

    // (b) Regression guards, except "https://exa mple.com" (red: accepted today).
    it.each([
        ['phone', 'abc'],
        ['phone', '+1 (555) 123-4567 ext 5'],
        ['phone', 'phone: 123'],
        ['phone', '(050) 123/4567'],
        ['phone', '０５０１２３４５６７'],
        ['phone', '+44 20 7946 0958 ext. 12'],
        ['phone', '*123#'],
        ['phone', '1-800-FLOWERS'],
        ['website', 'https://exa mple.com'],
        ['website', 'mailto:a@b.com'],
        ['website', 'example.com'],
        ['website', 'www.example.com'],
        ['website', 'bad'],
        ['email', 'a@localhost'],
        ['email', '"a b"@x.com'],
        ['email', 'bad2'],
        ['email', 'a@b@c.com'],
    ])('should still block %s "%s", which Wix refuses', (target, value) => {
        expect(probedValue(target, value).wixAccepted).toBe(false);
        expect(checkFormField(fieldOf(target), value).rule).toBe(RULE_OF_TARGET[target]);
    });

    // (c) Looser than Wix by design (Q4): regression guards, except custom-scheme (red: blocked today).
    it.each([
        ['website', 'https://x'],
        ['website', 'http://localhost:3000/a'],
        ['website', 'custom-scheme://foo.bar'],
        ['email', 'a@b.c'],
        ['email', 'a@b..com'],
    ])('should leave %s "%s" to Wix, which refuses it', (target, value) => {
        expect(probedValue(target, value).wixAccepted).toBe(false);
        expect(checkFormField(fieldOf(target), value).rule).toBe(FieldRule.NONE);
    });

    // (d) Regression guard: the bookings participant check keeps today's rules (Q20).
    it.each([
        ['PHONE', '054.123.4567', 'Please enter a valid phone number.'],
        ['PHONE', '12', 'Please enter a valid phone number.'],
        ['URL', 'HTTPS://EXAMPLE.COM', 'Please enter a valid URL.'],
    ] as const)('should keep the bookings %s rule refusing "%s"', (type, value, message) => {
        const field: FormFieldSummaryView = { target: 'f', label: 'F', type, required: false };
        expect(validateFormSummaryField(field, value)).toBe(message);
    });
});

/**
 * DL#55 P1c rewrite (Q29): the plugin posts as the caller, and the caller path refuses phones the
 * site path (L1) accepts, so these L1/L1b-accepted phones are now refused in the browser.
 * Found in: design-log/55 - wix validation parity for wix-forms.md §Phase 1c "format-parity rewrites"
 */
describe('site-path phones the caller path refuses (DL#55 P1c)', () => {
    it.each([
        ['054.123.4567', FieldRule.PHONE_COUNTRY],
        ['050.123.4567', FieldRule.PHONE_COUNTRY],
        ['020.7946.0958', FieldRule.PHONE_COUNTRY],
        ['050 123', FieldRule.PHONE_COUNTRY],
        ['054\u00a0123\u00a04567', FieldRule.PHONE_COUNTRY], // L1b, informational
        ['12', FieldRule.PHONE],
        ['.', FieldRule.PHONE],
        ['---', FieldRule.PHONE],
        ['+', FieldRule.PHONE],
    ])('should refuse "%s", which only the site path accepts', (value, rule) => {
        expect(probedValue('phone', value).wixAccepted).toBe(true);
        expect(checkFormField(fieldOf('phone'), value).rule).toBe(rule);
    });
});

interface CallerPathRow {
    item: string;
    rules: PhoneRules;
    typed: string;
    sent: string | null;
    status: number | null;
    stored: string | null;
}

const callerRows: CallerPathRow[] = JSON.parse(
    readFileSync(resolve(FIXTURES, 'wix-caller-path-phone-2026-11-12.json'), 'utf8'),
).rows;

/**
 * Bug: phones were posted as typed and Wix's caller path refused them (DL#55 P1c).
 * Oracle: the L7/L8 caller-path capture (test/fixtures/format-parity/README.md), each row with the
 *   PhoneRules it was captured under.
 */
describe('phone parity with Wix caller path (DL#55 P1c, L7/L8)', () => {
    it('should read the caller-path rows', () => {
        expect(callerRows).toHaveLength(13);
    });

    it.each(callerRows.filter((row) => row.status === 200))(
        '$item: should send "$typed" as the value Wix stored ($stored)',
        ({ typed, rules, stored }) => {
            expect(checkPhone(typed, rules)).toEqual({ rule: FieldRule.NONE, e164: stored });
        },
    );

    // Possible numbers are sent and Wix decides (Q33): the browser stays looser than the caller path.
    const LOOSER_BY_DESIGN = ['+15551234567'];

    it.each(
        callerRows.filter((row) => row.status === 400 && !LOOSER_BY_DESIGN.includes(row.typed)),
    )('$item: should never send "$typed" as typed, which Wix refused', ({ typed, rules }) => {
        const verdict = checkPhone(typed, rules);
        expect(verdict).not.toEqual({ rule: FieldRule.NONE, e164: typed });
    });

    it.each(callerRows.filter((row) => LOOSER_BY_DESIGN.includes(row.typed)))(
        '$item: should leave possible "$typed" to Wix, which refused it',
        ({ typed, rules, status }) => {
            expect(status).toBe(400);
            expect(checkPhone(typed, rules)).toEqual({ rule: FieldRule.NONE, e164: typed });
        },
    );
});
