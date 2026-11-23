/**
 * DL #60: three field rules that only the form contract can check. Generic HTML form rules
 * (token grammar, typed inputs, conditional error elements) belong to the a11y plugin and are not
 * repeated here.
 *
 *  - `wix-forms/field-autocomplete`: the field kind / Wix target / address part names the one
 *    right token. Missing → warning, wrong → error.
 *  - `wix-forms/field-invalid-unbound`: `aria-invalid` is bound to this field's `invalid`.
 *  - `wix-forms/field-error-undescribed`: the always-present element showing the field's error has
 *    an id that the input's `aria-describedby` lists.
 *
 * Each rule is suppressed page-wide by `wix-forms: { allow-<rule-id>: true }` in
 * `<script type="application/jay-validations">`. Fields are known only from the contract's nested
 * tags: a context without them stays silent.
 */

import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';
import { isAddressContractTag } from './address-bindings.js';
import {
    closestAncestor,
    matchedErrorRuleCondition,
    ownErrorBindings,
    selfOrAncestorBranchesOn,
    tagNameOf,
} from './markup-queries.js';

type ValidationContext = Parameters<JayHtmlValidatorFn>[0];

interface ContractTag {
    tag: string;
    meta?: Record<string, string>;
    tags?: ContractTag[];
}

interface FormImport {
    key?: string;
    contract?: { tags?: ContractTag[] };
}

type RuleId = 'field-autocomplete' | 'field-invalid-unbound' | 'field-error-undescribed';

interface VisibleField {
    kind?: string;
    target?: string;
}

interface FormFields {
    formKeys: Set<string>;
    /** `<key>.<field>` → the field's meta; visible fields only (they carry an `invalid` channel). */
    visible: Map<string, VisibleField>;
    /** `<key>.<addressTag>` of each address field. */
    addresses: Set<string>;
}

const PLUGIN_NAME = 'wix-forms';
const GUIDE = 'See: wix-forms rich-forms.md §6.';

export function detectFieldA11yRules(
    ctx: ValidationContext,
    formImports: FormImport[],
    findings: JayHtmlValidationFinding[],
): void {
    const fields = collectFormFields(formImports);
    if (!isSuppressed(ctx, 'field-autocomplete')) checkAutocomplete(ctx, fields, findings);
    if (!isSuppressed(ctx, 'field-invalid-unbound')) checkInvalidBinding(ctx, fields, findings);
    if (!isSuppressed(ctx, 'field-error-undescribed')) checkErrorLinkage(ctx, fields, findings);
}

function isSuppressed(ctx: ValidationContext, rule: RuleId): boolean {
    return ctx.validationOverrides?.[PLUGIN_NAME]?.[`allow-${rule}`] === true;
}

function collectFormFields(formImports: FormImport[]): FormFields {
    const fields: FormFields = { formKeys: new Set(), visible: new Map(), addresses: new Set() };
    for (const imp of formImports) {
        if (!imp.key) continue;
        fields.formKeys.add(imp.key);
        for (const tag of imp.contract?.tags ?? []) {
            const path = `${imp.key}.${tag.tag}`;
            if (isAddressContractTag(tag)) fields.addresses.add(path);
            else if (tag.tags?.some((child) => child.tag === 'invalid')) {
                fields.visible.set(path, { kind: tag.meta?.kind, target: tag.meta?.target });
            }
        }
    }
    return fields;
}

function finding(
    severity: JayHtmlValidationFinding['severity'],
    rule: RuleId,
    message: string,
    fix: string,
    attribute?: string,
): JayHtmlValidationFinding {
    return {
        severity,
        ...(attribute && { attribute }),
        message: `[${PLUGIN_NAME}/${rule}] ${message}`,
        suggestion: `${fix} Suppress with ${PLUGIN_NAME}: { allow-${rule}: true } in <script type="application/jay-validations">. ${GUIDE}`,
    };
}

function isBound(value: string | undefined | null): boolean {
    return typeof value === 'string' && value.includes('{');
}

// --- field-autocomplete --------------------------------------------------------------------

interface ExpectedToken {
    /** Accepted field-name tokens; empty = the field has no standard token. */
    tokens: string[];
    /** How the message names the field, e.g. `Wix email field "email"`. */
    subject: string;
    /** The part name, for a field with no standard token. */
    part?: string;
}

const TOKENS_BY_KIND: Record<string, string[]> = {
    email: ['email'],
    tel: ['tel', 'tel-national'],
    url: ['url'],
};

const TOKENS_BY_TARGET: Record<string, string[]> = {
    first_name: ['given-name'],
    last_name: ['family-name'],
};

/** Wix suffixes generated field keys with 4 hex digits (`first_name_5820`). */
const WIX_KEY_SUFFIX = /_[0-9a-f]{4}$/;

const TOKENS_BY_ADDRESS_PART: Record<string, string[]> = {
    country: ['country'],
    addressLine: ['address-line1'],
    addressLine2: ['address-line2'],
    city: ['address-level2'],
    subdivision: ['address-level1'],
    postalCode: ['postal-code'],
    streetName: [],
    streetNumber: [],
};

/** Tokens that qualify the field-name token (HTML autofill detail tokens). */
const QUALIFIER_TOKENS = new Set([
    'shipping',
    'billing',
    'home',
    'work',
    'mobile',
    'fax',
    'pager',
    'webauthn',
]);

const WHAT_A_TOKEN_FILLS: Record<string, string> = {
    name: 'a name',
    'given-name': 'a first name',
    'family-name': 'a last name',
    email: 'an email address',
    tel: 'a phone number',
    'tel-national': 'a phone number',
    url: 'a URL',
    country: 'a country',
    'address-line1': 'a street address line',
    'address-line2': 'a second address line',
    'address-level1': 'a region',
    'address-level2': 'a city',
    'postal-code': 'a postal code',
};

function checkAutocomplete(
    ctx: ValidationContext,
    fields: FormFields,
    findings: JayHtmlValidationFinding[],
): void {
    walkElements(ctx.body, ctx, (el: any) => {
        const ref: string | undefined = el?.getAttribute?.('ref');
        const expected = ref ? expectedTokenFor(ref, fields) : undefined;
        if (!expected) return;
        const autocomplete: string | undefined = el.getAttribute?.('autocomplete');
        if (isBound(autocomplete)) return;
        const fieldToken = fieldNameToken(autocomplete ?? '');
        if (!fieldToken) {
            if (expected.tokens.length === 0 || hasGenericallyCheckedType(el)) return;
            findings.push(missingTokenFinding(ref!, expected));
        } else if (fieldToken !== 'off' && !expected.tokens.includes(fieldToken)) {
            findings.push(wrongTokenFinding(ref!, expected, autocomplete!.trim(), fieldToken));
        }
    });
}

function expectedTokenFor(ref: string, fields: FormFields): ExpectedToken | undefined {
    const [key, field, third, fourth, ...rest] = ref.split('.');
    if (rest.length) return undefined;
    if (third === 'input' && fourth === undefined) {
        return expectedForField(fields.visible.get(`${key}.${field}`));
    }
    if ((fourth === 'input' || fourth === 'text') && fields.addresses.has(`${key}.${field}`)) {
        const tokens = TOKENS_BY_ADDRESS_PART[third];
        return tokens && { tokens, subject: `address part "${third}"`, part: third };
    }
    return undefined;
}

function expectedForField(field: VisibleField | undefined): ExpectedToken | undefined {
    if (!field?.target) return undefined;
    const byKind = field.kind ? TOKENS_BY_KIND[field.kind] : undefined;
    if (byKind) return { tokens: byKind, subject: `Wix ${field.kind} field "${field.target}"` };
    const byTarget = TOKENS_BY_TARGET[field.target.replace(WIX_KEY_SUFFIX, '')];
    return byTarget && { tokens: byTarget, subject: `Wix field "${field.target}"` };
}

/** The field-name token of an autocomplete value: section and qualifier tokens are skipped. */
function fieldNameToken(autocomplete: string): string | undefined {
    return autocomplete
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .find((token) => token && !token.startsWith('section-') && !QUALIFIER_TOKENS.has(token));
}

/** A typed email/tel input: the a11y plugin's `autocomplete-missing` already reports it. */
function hasGenericallyCheckedType(el: any): boolean {
    const type = String(el.getAttribute?.('type') ?? '')
        .trim()
        .toLowerCase();
    return type === 'email' || type === 'tel';
}

function missingTokenFinding(ref: string, expected: ExpectedToken): JayHtmlValidationFinding {
    const [first, ...alternatives] = expected.tokens;
    const alsoAccepted = alternatives.map((token) => ` (or "${token}")`).join('');
    return finding(
        'warning',
        'field-autocomplete',
        `ref="${ref}" (${expected.subject}) has no autocomplete, so the browser cannot autofill it.`,
        `Add autocomplete="${first}"${alsoAccepted}.`,
        'ref',
    );
}

function wrongTokenFinding(
    ref: string,
    expected: ExpectedToken,
    autocomplete: string,
    fieldToken: string,
): JayHtmlValidationFinding {
    const fills = WHAT_A_TOKEN_FILLS[fieldToken] ?? `its "${fieldToken}" value`;
    const fix =
        expected.tokens.length === 0
            ? `Remove the autocomplete: ${expected.part} has no standard token.`
            : `Use autocomplete="${expected.tokens[0]}".`;
    return finding(
        'error',
        'field-autocomplete',
        `ref="${ref}" (${expected.subject}) has autocomplete="${autocomplete}"; the browser will fill ${fills} into it.`,
        fix,
        'autocomplete',
    );
}

// --- field-invalid-unbound -----------------------------------------------------------------

function checkInvalidBinding(
    ctx: ValidationContext,
    fields: FormFields,
    findings: JayHtmlValidationFinding[],
): void {
    walkElements(ctx.body, ctx, (el: any) => {
        const ref: string | undefined = el?.getAttribute?.('ref');
        const expected = ref ? expectedInvalidBinding(ref, fields) : undefined;
        if (!expected) return;
        const actual: string | undefined | null = el.getAttribute?.('aria-invalid');
        const problem = invalidBindingProblem(actual, expected);
        if (!problem) return;
        findings.push(
            finding(
                'warning',
                'field-invalid-unbound',
                `ref="${ref}" ${problem}`,
                `Use aria-invalid="${expected}".`,
                actual === undefined || actual === null ? 'ref' : 'aria-invalid',
            ),
        );
    });
}

/** `{<key>.<field>.invalid}` for a field input; `{$parent.…}` for a chip toggle inside the options loop. */
function expectedInvalidBinding(ref: string, fields: FormFields): string | undefined {
    const [key, field, ...channel] = ref.split('.');
    const fieldPath = `${key}.${field}`;
    if (!fields.visible.has(fieldPath)) return undefined;
    const path = channel.join('.');
    if (path === 'input') return `{${fieldPath}.invalid}`;
    if (path === 'options.toggle') return `{$parent.${fieldPath}.invalid}`;
    return undefined;
}

function invalidBindingProblem(
    actual: string | undefined | null,
    expected: string,
): string | undefined {
    const neverSaysInvalid = 'so screen readers never say "invalid".';
    if (actual === undefined || actual === null) {
        return `has no aria-invalid bound to the field's invalid state, ${neverSaysInvalid}`;
    }
    if (actual.replace(/\s+/g, '') === expected) return undefined;
    if (!isBound(actual)) {
        const effect =
            actual.trim().toLowerCase() === 'false'
                ? neverSaysInvalid
                : 'so screen readers say "invalid" before the visitor typed anything.';
        return `has a static aria-invalid="${actual}"; it must follow the field's invalid state, ${effect}`;
    }
    return `has aria-invalid="${actual}", which is another field's state; it must be ${expected}.`;
}

// --- field-error-undescribed ---------------------------------------------------------------

interface ErrorDisplay {
    element: any;
    fieldPath: string;
    /** `{k.f.error}` text, or a wrapper of `errorRule` branches (Q6). */
    shows: 'text' | 'branches';
}

interface DescribedTarget {
    elements: any[];
    /** How messages name the element that should list the error id. */
    name: string;
    noun: 'input' | 'chip <fieldset>';
}

function checkErrorLinkage(
    ctx: ValidationContext,
    fields: FormFields,
    findings: JayHtmlValidationFinding[],
): void {
    for (const display of collectErrorDisplays(ctx, fields)) {
        const target = describedTargetOf(ctx, display.fieldPath);
        if (!target) continue;
        const problem = linkageProblem(display, target);
        if (problem) findings.push(problem);
    }
}

/** Always-present elements showing a visible field's error (own `if` / `when-*` = conditional). */
function collectErrorDisplays(ctx: ValidationContext, fields: FormFields): ErrorDisplay[] {
    const displays: ErrorDisplay[] = [];
    walkElements(ctx.body, ctx, (el: any) => {
        if (tagNameOf(el) === 'label' || isConditional(el)) return;
        const textPaths = ownErrorBindings(el, fields.formKeys).filter(
            (fieldPath) => !selfOrAncestorBranchesOn(el, fieldPath, fields.formKeys),
        );
        const branchPaths = errorRuleBranchChildren(el, fields.formKeys);
        for (const fieldPath of new Set([...textPaths, ...branchPaths])) {
            if (!fields.visible.has(fieldPath)) continue;
            displays.push({
                element: el,
                fieldPath,
                shows: textPaths.includes(fieldPath) ? 'text' : 'branches',
            });
        }
    });
    return displays;
}

function isConditional(el: any): boolean {
    if (el?.getAttribute?.('if') !== undefined && el?.getAttribute?.('if') !== null) return true;
    return Object.keys(el?.attributes ?? {}).some((name) => name.startsWith('when-'));
}

/** Fields whose `errorRule` branches are direct children without their own id (Q6). */
function errorRuleBranchChildren(el: any, formKeys: Set<string>): string[] {
    return (el?.childNodes ?? [])
        .filter((child: any) => child.nodeType === 1 && !child.getAttribute?.('id'))
        .map((child: any) => matchedErrorRuleCondition(child, formKeys)?.fieldPath)
        .filter((fieldPath: string | undefined): fieldPath is string => Boolean(fieldPath));
}

function describedTargetOf(ctx: ValidationContext, fieldPath: string): DescribedTarget | undefined {
    const inputs: any[] = [];
    const chipGroups = new Set<any>();
    walkElements(ctx.body, ctx, (el: any) => {
        const ref = el?.getAttribute?.('ref');
        if (ref === `${fieldPath}.input`) inputs.push(el);
        if (ref === `${fieldPath}.options.toggle`) {
            const fieldset = closestAncestor(el, 'fieldset');
            if (fieldset) chipGroups.add(fieldset);
        }
    });
    if (inputs.length) return { elements: inputs, name: `ref="${fieldPath}.input"`, noun: 'input' };
    if (chipGroups.size) {
        return { elements: [...chipGroups], name: 'the chip <fieldset>', noun: 'chip <fieldset>' };
    }
    return undefined;
}

function linkageProblem(
    display: ErrorDisplay,
    target: DescribedTarget,
): JayHtmlValidationFinding | undefined {
    const describedBy = target.elements.map((el) => el.getAttribute?.('aria-describedby'));
    const id: string | undefined = display.element.getAttribute?.('id');
    if (describedBy.some(isBound) || isBound(id)) return undefined;
    const tag = tagNameOf(display.element);
    const shows =
        display.shows === 'text'
            ? `{${display.fieldPath}.error}`
            : `${display.fieldPath}.errorRule branches`;
    if (!id) {
        const suggestedId = errorIdFor(display.fieldPath);
        return finding(
            'warning',
            'field-error-undescribed',
            `<${tag}> showing ${shows}${insideRefOf(display.element)} has no id, so ${target.name} cannot point aria-describedby at it; the error is not read when the field is focused.`,
            `Give it id="${suggestedId}" and add aria-describedby="${suggestedId}" to the ${target.noun}.`,
        );
    }
    const linked = describedBy.some((value) => (value ?? '').split(/\s+/).includes(id));
    if (linked) return undefined;
    return finding(
        'warning',
        'field-error-undescribed',
        `<${tag} id="${id}"> showing ${shows} is not in ${target.name}'s aria-describedby, so the error is not read when the field is focused.`,
        `Add "${id}" to the ${target.noun}'s aria-describedby.`,
    );
}

function insideRefOf(el: any): string {
    for (let node = el?.parentNode; node; node = node.parentNode) {
        const ref = node.getAttribute?.('ref');
        if (ref) return ` inside ref="${ref}"`;
    }
    return '';
}

/** `contact.firstName` → `contact-first-name-error`. */
function errorIdFor(fieldPath: string): string {
    const kebab = fieldPath
        .replace(/\./g, '-')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
    return `${kebab}-error`;
}
