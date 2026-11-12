/**
 * wix-forms plugin validator — per-form contract bindings.
 *
 * Fires on jay-html pages that use per-form contracts. Two detectable cases:
 *
 *  1. Retired generic `fields` binding — a `form/<slug>` import that still binds
 *     `<key>.fields` (the generic repeated array is no longer supported). This is
 *     the GUARANTEED case: the `form/` import resolves, so it appears in
 *     `headlessImports`. Detected across every binding form (data/forEach/if/ref).
 *  2. Unknown field tag used as a `ref` — `ref="<key>.<missingField>…"` whose
 *     first segment is not a tag of the form's contract. Core contract-binding
 *     validation already rejects unknown DATA bindings (`{<key>.x}`, `forEach`,
 *     `if`, attributes) but SILENTLY grafts unknown `ref=` sub-tags
 *     (`graftTemplateOnlyRefs`), so this check closes the one gap core misses.
 *
 *  3. Accessibility warnings — unlabeled field input, error text inside a <label>, native
 *     `required` without `novalidate` (DL#41 Addendum A).
 *  4. Unguarded <form> warning — a <form> holding a key's refs but no `<key>.submitButton`, so
 *     the native submit is never intercepted and reloads the page (DL#44 rule 3).
 *  5. Option refs (DL#44 rules 1, 2) — `<key>.<field>.options.<child>` must be a tag of that
 *     field's options (`toggle` exists only on a multiselect), and a `.control` inside
 *     `forEach` over a multiselect's options is warned: it stores one value, not a selection.
 *  6. A phone error shown only under `errorRule === PHONE` (DL#55 P1c): `PHONE_COUNTRY` would
 *     show no error.
 *
 * Best-effort: a page still importing the retired `contract="wix-form"` also
 * gets a migration message, IF the unresolved name surfaces in headlessImports.
 */

import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';

const RETIRED_CONTRACT_NAME = 'wix-form';
const FORM_CONTRACT_PREFIX = 'form/';

const MIGRATION_HINT =
    'The generic `.fields` binding is no longer supported. Bind explicit per-form field tags instead ' +
    '— e.g. `{contact.email.label}`, `ref="contact.email.input"`, ' +
    '`<option forEach="contact.country.options" trackBy="value">`. Field names come from the ' +
    "materialized `form/<slug>` contract for that form (or your project's wix-forms forms reference).";

export const validateWixFormBindings: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];

    for (const imp of ctx.headlessImports) {
        if (imp.contractName === RETIRED_CONTRACT_NAME) {
            findings.push({
                severity: 'error',
                message:
                    'Contract "wix-form" is no longer supported — import a per-form contract "form/<slug>" instead.',
                suggestion: MIGRATION_HINT,
            });
        }
    }

    const formImports = ctx.headlessImports.filter(
        (imp) => imp.key && imp.contractName?.startsWith(FORM_CONTRACT_PREFIX),
    );
    if (formImports.length === 0) {
        return findings;
    }

    detectRetiredFieldsBindings(ctx, formImports, findings);
    const infoByKey = collectFormImportInfo(formImports);
    detectUnknownRefFieldTags(ctx, infoByKey, findings);
    detectScalarControlOverOptions(ctx, infoByKey, findings);
    detectAccessibilityIssues(ctx, new Set(formImports.map((imp) => imp.key!)), findings);
    detectUnguardedForms(ctx, new Set(formImports.map((imp) => imp.key!)), findings);
    detectPhoneRuleWithoutCountryBranch(ctx, new Set(formImports.map((imp) => imp.key!)), findings);
    return findings;
};

/**
 * A <form> holding a key's refs but no `<key>.submitButton` (DL#44 rule 3): the runtime finds
 * the <form> to guard only through that button, so the native submit reloads the page.
 * Known false positive: a submit button outside the <form>, associated with `form="<id>"`.
 */
function detectUnguardedForms(
    ctx: Parameters<JayHtmlValidatorFn>[0],
    formKeys: Set<string>,
    findings: JayHtmlValidationFinding[],
): void {
    const keysByForm = new Map<any, Map<string, { guarded: boolean }>>();
    walkElements(ctx.body, ctx, (el: any) => {
        const ref: string | undefined = el?.getAttribute?.('ref');
        const key = ref?.split('.')[0];
        if (!key || !formKeys.has(key)) return;
        const form = closestAncestor(el, 'form');
        if (!form) return;
        const keys = keysByForm.get(form) ?? new Map<string, { guarded: boolean }>();
        keysByForm.set(form, keys);
        const entry = keys.get(key) ?? { guarded: false };
        keys.set(key, entry);
        if (ref === `${key}.submitButton`) entry.guarded = true;
    });

    for (const keys of keysByForm.values()) {
        for (const [key, { guarded }] of keys) {
            if (guarded) continue;
            findings.push({
                severity: 'warning',
                message: `A <form> holds "${key}" refs but no ref="${key}.submitButton", so its native submit is not intercepted and reloads the page.`,
                suggestion: `Add ref="${key}.submitButton" to the form's submit button.`,
            });
        }
    }
}

/**
 * Accessibility warnings (DL#41 Addendum A) — the mechanically detectable parts of the
 * accessible form pattern; the rest lives in the rich-forms guide.
 */
function detectAccessibilityIssues(
    ctx: Parameters<JayHtmlValidatorFn>[0],
    formKeys: Set<string>,
    findings: JayHtmlValidationFinding[],
): void {
    walkElements(ctx.body, ctx, (el: any) => {
        if (tagNameOf(el) === 'label') {
            const errorBinding = findErrorBinding(String(el.toString?.() ?? ''), formKeys);
            if (errorBinding) {
                findings.push({
                    severity: 'warning',
                    message: `<label> contains the error binding "{${errorBinding}}", so the error text becomes part of the field's accessible name.`,
                    suggestion:
                        'Place the error element after the <label> and link it from the input with aria-describedby.',
                });
            }
            return;
        }

        const ref: string | undefined = el?.getAttribute?.('ref');
        if (!ref) return;
        const [key, field, channel] = ref.split('.');
        if (!formKeys.has(key) || channel !== 'input') return;

        if (!hasAccessibleLabel(el, ctx.body)) {
            findings.push({
                severity: 'warning',
                message: `ref="${ref}" has no accessible label.`,
                suggestion: `Wrap it in <label>{${key}.${field}.label} …</label>, or point a <label for> at its id, or add aria-label / aria-labelledby.`,
                attribute: 'ref',
            });
        }

        const form = closestAncestor(el, 'form');
        if (el.hasAttribute?.('required') && form && !form.hasAttribute?.('novalidate')) {
            findings.push({
                severity: 'warning',
                message: `ref="${ref}" uses native "required" inside a <form> without "novalidate" — the browser's own validation blocks the submit event, so wix-forms never submits or shows its errors.`,
                suggestion: `Use aria-required="{${key}.${field}.required}" and add novalidate to the <form>.`,
                attribute: 'required',
            });
        }
    });
}

function findErrorBinding(html: string, formKeys: Set<string>): string | undefined {
    for (const key of formKeys) {
        const match = html.match(new RegExp(`\\{(${escapeRegExp(key)}\\.\\w+\\.error)\\}`));
        if (match) return match[1];
    }
    return undefined;
}

function hasAccessibleLabel(el: any, body: any): boolean {
    if (closestAncestor(el, 'label')) return true;
    if (el.getAttribute?.('aria-label') || el.getAttribute?.('aria-labelledby')) return true;
    const id = el.getAttribute?.('id');
    if (!id) return false;
    return (body?.querySelectorAll?.('label') ?? []).some(
        (label: any) => label.getAttribute?.('for') === id,
    );
}

function closestAncestor(el: any, tagName: string): any {
    for (let node = el?.parentNode; node; node = node.parentNode) {
        if (tagNameOf(node) === tagName) return node;
    }
    return undefined;
}

function tagNameOf(el: any): string {
    return String(el?.rawTagName ?? el?.tagName ?? '').toLowerCase();
}

function detectRetiredFieldsBindings(
    ctx: Parameters<JayHtmlValidatorFn>[0],
    formImports: Array<{ key?: string }>,
    findings: JayHtmlValidationFinding[],
): void {
    const serialized = serializeBody(ctx.body);
    if (!serialized) return;
    for (const imp of formImports) {
        const key = imp.key!;
        const pattern = new RegExp(`\\b${escapeRegExp(key)}\\.fields\\b`);
        if (pattern.test(serialized)) {
            findings.push({
                severity: 'error',
                message: `Binding "${key}.fields" is invalid — the generic ".fields" array was removed; use explicit field tags (e.g. "${key}.email.label").`,
                suggestion: MIGRATION_HINT,
                attribute: 'fields',
            });
        }
    }
}

interface ContractTag {
    tag: string;
    tags?: ContractTag[];
}

interface FormImportInfo {
    contractName: string;
    tags: Set<string>;
    /** Per-field sub-contract tag names, when the validation context carries nested tags (gate iv). */
    subTagsByField: Map<string, Set<string>>;
    /** Per-field `options` item tag names, when nested tags reach that deep (DL#44 rule 1). */
    optionTagsByField: Map<string, Set<string>>;
}

type FormImport = { key?: string; contractName: string; contract?: { tags?: ContractTag[] } };

function collectFormImportInfo(formImports: FormImport[]): Map<string, FormImportInfo> {
    const infoByKey = new Map<string, FormImportInfo>();
    for (const imp of formImports) {
        const topTags = imp.contract?.tags ?? [];
        const subTagsByField = new Map<string, Set<string>>();
        const optionTagsByField = new Map<string, Set<string>>();
        for (const tag of topTags) {
            if (!Array.isArray(tag.tags) || !tag.tags.length) continue;
            subTagsByField.set(tag.tag, new Set(tag.tags.map((sub) => sub.tag)));
            const options = tag.tags.find((sub) => sub.tag === 'options');
            if (options?.tags?.length) {
                optionTagsByField.set(tag.tag, new Set(options.tags.map((child) => child.tag)));
            }
        }
        infoByKey.set(imp.key!, {
            contractName: imp.contractName,
            tags: new Set(topTags.map((tag) => tag.tag)),
            subTagsByField,
            optionTagsByField,
        });
    }
    return infoByKey;
}

function detectUnknownRefFieldTags(
    ctx: Parameters<JayHtmlValidatorFn>[0],
    infoByKey: Map<string, FormImportInfo>,
    findings: JayHtmlValidationFinding[],
): void {
    walkElements(ctx.body, ctx, (el: any) => {
        const ref: string | undefined = el?.getAttribute?.('ref');
        if (!ref) return;
        const [key, firstSegment, secondSegment, thirdSegment] = ref.split('.');
        const info = infoByKey.get(key);
        if (!info) return; // not a per-form import key
        if (!firstSegment || firstSegment === 'fields') return; // retired-fields handled above
        if (info.tags.size === 0) return; // contract tags unavailable — nothing to check against
        if (!info.tags.has(firstSegment)) {
            findings.push({
                severity: 'error',
                message: `ref="${ref}" binds "${firstSegment}", which is not a field of contract "${info.contractName}".`,
                suggestion:
                    `Available tags: ${[...info.tags].sort().join(', ')}. ` +
                    'Use a field name from the materialized form/<slug> contract for this import.',
                attribute: 'ref',
            });
            return;
        }
        // Second-segment sub-tag check (DL#41 §Agent Feedback Loop — gate iv). Only runs when the
        // validation context carries the field's nested sub-contract tags; otherwise the guaranteed
        // first-segment check above plus the agent-kit guide cover it (the stated fallback).
        if (!secondSegment) return;
        const subTags = info.subTagsByField.get(firstSegment);
        if (!subTags || subTags.size === 0) return; // nested tags unavailable — fallback holds
        if (!subTags.has(secondSegment)) {
            findings.push({
                severity: 'error',
                message: `ref="${ref}" binds "${firstSegment}.${secondSegment}", which is not a channel of field "${firstSegment}".`,
                suggestion:
                    `Available channels: ${[...subTags].sort().join(', ')}. ` +
                    'A custom-UI field binds `.control`; a native field binds `.input`; ' +
                    'multi-choice checkboxes bind `.options.toggle`.',
                attribute: 'ref',
            });
            return;
        }
        if (secondSegment !== 'options' || !thirdSegment) return;
        const optionTags = info.optionTagsByField.get(firstSegment);
        if (!optionTags || optionTags.size === 0) return; // nested option tags unavailable
        if (!optionTags.has(thirdSegment)) {
            findings.push({
                severity: 'error',
                message: `ref="${ref}" binds "${firstSegment}.options.${thirdSegment}", which is not a tag of the options of field "${firstSegment}".`,
                suggestion:
                    `Available option tags: ${[...optionTags].sort().join(', ')}. ` +
                    "Only a multiselect's options carry `toggle`; a single select binds `.input`.",
                attribute: 'ref',
            });
        }
    });
}

/**
 * `.control` inside `forEach="<key>.<field>.options"` of a multiselect (DL#44 rule 2): control
 * stores one value, so each chip click replaces the selection. Only the absolute `forEach`
 * spelling is matched; anything else stays silent (a missed warning, never a false one).
 */
function detectScalarControlOverOptions(
    ctx: Parameters<JayHtmlValidatorFn>[0],
    infoByKey: Map<string, FormImportInfo>,
    findings: JayHtmlValidationFinding[],
): void {
    walkElements(ctx.body, ctx, (el: any) => {
        const ref: string | undefined = el?.getAttribute?.('ref');
        const [key, field, channel, extra] = ref?.split('.') ?? [];
        if (channel !== 'control' || extra) return;
        if (!infoByKey.get(key)?.optionTagsByField.get(field)?.has('toggle')) return;
        const loop = `${key}.${field}.options`;
        if (!selfOrAncestorLoopsOver(el, loop)) return;
        findings.push({
            severity: 'warning',
            message: `ref="${ref}" inside forEach="${loop}" stores a single value, so each click replaces the selection instead of toggling one option.`,
            suggestion: `Bind each checkbox with ref="${loop}.toggle".`,
            attribute: 'ref',
        });
    });
}

/** `<key>.<field>.errorRule === RULE` (or `==`), the whole condition; anything else is unrecognised. */
const ERROR_RULE_CONDITION = /^(\w+)\.(\w+)\.errorRule\s*===?\s*(\w+)$/;
const ERROR_TEXT_BINDING = /\{\s*(\w+)\.(\w+)\.error\s*\}/g;

interface PhoneErrorDisplay {
    rules: Set<string>;
    hasUnconditionalBinding: boolean;
}

/**
 * Warning 6 (DL#55 P1c): a field that branches on errorRule PHONE but not PHONE_COUNTRY, with every
 * `{<key>.<field>.error}` text binding inside a matched branch, shows nothing for PHONE_COUNTRY.
 * Only a whole `if=` of the form `<key>.<field>.errorRule === RULE` is matched; any other condition
 * is unrecognised and stays silent (a missed warning, never a false one). Attribute expressions
 * are not bindings: they do not show the error to a sighted visitor.
 */
function detectPhoneRuleWithoutCountryBranch(
    ctx: Parameters<JayHtmlValidatorFn>[0],
    formKeys: Set<string>,
    findings: JayHtmlValidationFinding[],
): void {
    const displays = collectErrorDisplays(ctx, formKeys);
    for (const [fieldPath, { rules, hasUnconditionalBinding }] of displays) {
        if (!rules.has('PHONE') || rules.has('PHONE_COUNTRY') || hasUnconditionalBinding) continue;
        findings.push({
            severity: 'warning',
            message: `\`${fieldPath}\` branches on errorRule PHONE but not PHONE_COUNTRY: a phone without a country code would show no error. Add a PHONE_COUNTRY branch or print {${fieldPath}.error} unconditionally (DL#55 P1c).`,
            suggestion: `Add <span if="${fieldPath}.errorRule === PHONE_COUNTRY">…</span>, or print {${fieldPath}.error} outside the errorRule branches.`,
        });
    }
}

function collectErrorDisplays(
    ctx: Parameters<JayHtmlValidatorFn>[0],
    formKeys: Set<string>,
): Map<string, PhoneErrorDisplay> {
    const displays = new Map<string, PhoneErrorDisplay>();
    const displayOf = (fieldPath: string) => {
        const display = displays.get(fieldPath) ?? {
            rules: new Set(),
            hasUnconditionalBinding: false,
        };
        displays.set(fieldPath, display);
        return display;
    };
    walkElements(ctx.body, ctx, (el: any) => {
        const condition = matchedErrorRuleCondition(el, formKeys);
        if (condition) displayOf(condition.fieldPath).rules.add(condition.rule);
        for (const fieldPath of ownErrorBindings(el, formKeys)) {
            if (!selfOrAncestorBranchesOn(el, fieldPath, formKeys)) {
                displayOf(fieldPath).hasUnconditionalBinding = true;
            }
        }
    });
    return displays;
}

function matchedErrorRuleCondition(
    el: any,
    formKeys: Set<string>,
): { fieldPath: string; rule: string } | undefined {
    const condition: string | undefined = el?.getAttribute?.('if');
    const match = condition?.trim().match(ERROR_RULE_CONDITION);
    if (!match || !formKeys.has(match[1])) return undefined;
    return { fieldPath: `${match[1]}.${match[2]}`, rule: match[3] };
}

/** `{<key>.<field>.error}` in the element's own text nodes only. */
function ownErrorBindings(el: any, formKeys: Set<string>): string[] {
    const ownText = (el?.childNodes ?? [])
        .filter((child: any) => child.nodeType === 3)
        .map((child: any) => String(child.rawText ?? child.text ?? ''))
        .join(' ');
    return [...ownText.matchAll(ERROR_TEXT_BINDING)]
        .filter((match) => formKeys.has(match[1]))
        .map((match) => `${match[1]}.${match[2]}`);
}

function selfOrAncestorBranchesOn(el: any, fieldPath: string, formKeys: Set<string>): boolean {
    for (let node = el; node; node = node.parentNode) {
        if (matchedErrorRuleCondition(node, formKeys)?.fieldPath === fieldPath) return true;
    }
    return false;
}

function selfOrAncestorLoopsOver(el: any, loop: string): boolean {
    for (let node = el; node; node = node.parentNode) {
        if (node.getAttribute?.('forEach') === loop) return true;
    }
    return false;
}

function serializeBody(body: unknown): string {
    try {
        return String((body as { toString(): string })?.toString?.() ?? '');
    } catch {
        return '';
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
