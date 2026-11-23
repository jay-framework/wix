import * as path from 'node:path';
import type {
    JayHtmlValidationContext,
    JayHtmlValidationFinding,
    JayHtmlValidatorFn,
} from '@jay-framework/compiler-shared';
import {
    PLUGIN_KEY,
    isPasswordName,
    ruleMessage,
    ruleSuggestion,
    type CredentialRuleId,
} from './credential-rules';
import { findAuthPages, type AuthCall } from './find-auth-pages';
import { loadJayConfigForCredentials } from './load-validation-suppressions';
import { TypeScriptMissingError } from './load-typescript';

/**
 * Login / sign-up page rules (Design Log #63): password fields in a real <form>, typed
 * `password`, with the autocomplete role that matches the API the page calls.
 */
export const validateCredentialsPage: JayHtmlValidatorFn = async (ctx) => {
    const calls = await authCallsOfPage(ctx);
    if (!calls) return [];
    const isSuppressed = pageSuppressions(ctx);
    const fields = collectInputs(ctx.body);
    const passwordFields = fields.filter((field) => field.isPassword);
    const findings = [
        ...passwordNotInForm(passwordFields),
        ...passwordType(passwordFields),
        ...autocompleteRole(passwordFields, calls),
        ...identifierAutocomplete(fields),
    ];
    return findings.filter((finding) => !isSuppressed(finding.rule)).map(({ rule, ...f }) => f);
};

async function authCallsOfPage(ctx: JayHtmlValidationContext): Promise<Set<AuthCall> | undefined> {
    try {
        const scan = await findAuthPages(ctx.projectRoot);
        // jay passes filePath project-relative; resolving it against cwd would miss the page.
        const pagePath = path.resolve(ctx.projectRoot, ctx.filePath);
        return scan.pages.find((page) => page.pageJayHtml === pagePath)?.calls;
    } catch (error) {
        // The project validator reports a missing typescript once; stay silent here.
        if (error instanceof TypeScriptMissingError) return undefined;
        throw error;
    }
}

function pageSuppressions(ctx: JayHtmlValidationContext): (rule: CredentialRuleId) => boolean {
    const pageOverrides = ctx.validationOverrides?.[PLUGIN_KEY] ?? {};
    const { suppressions } = loadJayConfigForCredentials(ctx.projectRoot);
    return (rule) => pageOverrides[rule] === true || suppressions[rule] === true;
}

// --- DOM model ------------------------------------------------------------------------------

interface InputField {
    element: any;
    form: any | undefined;
    label: string;
    isPassword: boolean;
    /** Static attribute value; `undefined` when absent; `BOUND` when it contains a binding. */
    type: string | undefined | typeof BOUND;
    autocomplete: string | undefined | typeof BOUND;
}

const BOUND = Symbol('bound');
const IDENTITY_ATTRS = ['ref', 'name', 'id'];

function collectInputs(root: any): InputField[] {
    const fields: InputField[] = [];
    walk(root, undefined, (element, form) => {
        if (tagOf(element) !== 'input') return;
        const type = staticAttr(element, 'type');
        const names = IDENTITY_ATTRS.map((attr) => element.getAttribute?.(attr)).filter(Boolean);
        fields.push({
            element,
            form,
            label: describe(element),
            isPassword:
                (typeof type === 'string' && type.toLowerCase() === 'password') ||
                names.some((name: string) => isPasswordName(name)),
            type,
            autocomplete: staticAttr(element, 'autocomplete'),
        });
    });
    return fields;
}

/** Walks plain elements (forEach/if included); nested component tags are not entered. */
function walk(node: any, form: any, onElement: (element: any, form: any) => void): void {
    for (const child of node.childNodes ?? []) {
        if (child.nodeType !== 1) continue;
        if (isComponentTag(child)) continue;
        onElement(child, form);
        walk(child, tagOf(child) === 'form' ? child : form, onElement);
    }
}

function tagOf(element: any): string {
    return (element.rawTagName ?? '').toLowerCase();
}

function isComponentTag(element: any): boolean {
    const raw: string = element.rawTagName ?? '';
    return raw.includes(':') || /^[A-Z]/.test(raw);
}

function staticAttr(element: any, name: string): string | undefined | typeof BOUND {
    const value: string | undefined = element.getAttribute?.(name);
    if (value === undefined) return undefined;
    return value.includes('{') ? BOUND : value;
}

function describe(element: any): string {
    for (const attr of IDENTITY_ATTRS) {
        const value = element.getAttribute?.(attr);
        if (value) return `<input ${attr}="${value}">`;
    }
    return '<input>';
}

function tokens(value: string | undefined): string[] {
    return (value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

// --- Rules ----------------------------------------------------------------------------------

type RuleFinding = JayHtmlValidationFinding & { rule: CredentialRuleId };

function finding(
    rule: CredentialRuleId,
    severity: 'error' | 'warning',
    field: InputField | undefined,
    message: string,
    suggestion: string,
): RuleFinding {
    return {
        rule,
        severity,
        message: ruleMessage(rule, message),
        suggestion: ruleSuggestion(suggestion, rule),
        element: field?.label ?? '<form>',
        attribute:
            rule === 'password-type'
                ? 'type'
                : rule === 'password-not-in-form'
                  ? undefined
                  : 'autocomplete',
    };
}

function passwordNotInForm(passwordFields: InputField[]): RuleFinding[] {
    return passwordFields
        .filter((field) => !field.form)
        .map((field) =>
            finding(
                'password-not-in-form',
                'error',
                field,
                `${field.label} is a password field outside any <form>, so password managers do not reliably offer to save it and Enter does not submit.`,
                'Wrap the fields in <form ref="form"> with a <button type="submit"> and handle the form submit event.',
            ),
        );
}

function passwordType(passwordFields: InputField[]): RuleFinding[] {
    return passwordFields
        .filter((field) => field.type !== BOUND && field.type?.toLowerCase() !== 'password')
        .map((field) =>
            finding(
                'password-type',
                'error',
                field,
                `${field.label} holds a password but has type="${typeof field.type === 'string' ? field.type : 'text'}", so it is shown on screen and not treated as a password.`,
                'Set type="password" (a show/hide toggle may bind type="{…}").',
            ),
        );
}

const ROLE: Record<AuthCall, string> = { login: 'current-password', register: 'new-password' };

function autocompleteRole(passwordFields: InputField[], calls: Set<AuthCall>): RuleFinding[] {
    const checked = passwordFields.filter((field) => field.autocomplete !== BOUND);
    if (calls.size === 2) return combinedPageRoles(checked);
    const [call] = [...calls];
    const role = ROLE[call];
    return checked
        .filter((field) => !tokens(field.autocomplete as string | undefined).includes(role))
        .map((field) =>
            finding(
                'autocomplete-role',
                'error',
                field,
                `This page calls ${call}(), so ${field.label} must use autocomplete="${role}" (found ${foundToken(field)}).`,
                `Set autocomplete="${role}".`,
            ),
        );
}

/** A page calling both login() and register(): one homogeneous form per role. */
function combinedPageRoles(passwordFields: InputField[]): RuleFinding[] {
    const rolesByForm = new Map<any, Set<string>>();
    for (const field of passwordFields.filter((f) => f.form)) {
        const roles = rolesByForm.get(field.form) ?? new Set<string>();
        tokens(field.autocomplete as string | undefined)
            .filter((token) => token === ROLE.login || token === ROLE.register)
            .forEach((token) => roles.add(token));
        if (
            !tokens(field.autocomplete as string | undefined).some((t) => t.endsWith('-password'))
        ) {
            roles.add('none');
        }
        rolesByForm.set(field.form, roles);
    }
    const findings: RuleFinding[] = [];
    for (const roles of rolesByForm.values()) {
        if (roles.size > 1) {
            findings.push(
                finding(
                    'autocomplete-role',
                    'error',
                    undefined,
                    `A <form> on this login + sign-up page mixes password roles (${[...roles].join(', ')}); each form must be all current-password (login) or all new-password (sign-up).`,
                    'Give the login form autocomplete="current-password" and the sign-up form autocomplete="new-password".',
                ),
            );
        }
    }
    const allRoles = new Set([...rolesByForm.values()].flatMap((roles) => [...roles]));
    if (!findings.length && (!allRoles.has(ROLE.login) || !allRoles.has(ROLE.register))) {
        findings.push(
            finding(
                'autocomplete-role',
                'error',
                undefined,
                'This page calls login() and register(), so it needs one <form> with autocomplete="current-password" and one with autocomplete="new-password".',
                'Split it into a login form (current-password) and a sign-up form (new-password).',
            ),
        );
    }
    return findings;
}

function foundToken(field: InputField): string {
    return field.autocomplete === undefined ? 'no autocomplete' : `"${String(field.autocomplete)}"`;
}

function identifierAutocomplete(fields: InputField[]): RuleFinding[] {
    const forms = new Set(fields.filter((f) => f.isPassword && f.form).map((f) => f.form));
    const findings: RuleFinding[] = [];
    for (const form of forms) {
        const identifier = identifierInput(fields.filter((f) => f.form === form));
        const value = identifier?.autocomplete;
        if (!identifier || value === undefined || value === BOUND) continue;
        if (tokens(value).some((token) => token === 'username' || token === 'email')) continue;
        findings.push(
            finding(
                'identifier-autocomplete',
                'warning',
                identifier,
                `${identifier.label} is the sign-in identifier but has autocomplete="${value}", so password managers do not pair it with the password.`,
                'Set autocomplete="username" (or "email").',
            ),
        );
    }
    return findings;
}

function identifierInput(formFields: InputField[]): InputField | undefined {
    const typeOf = (field: InputField) =>
        typeof field.type === 'string' ? field.type.toLowerCase() : field.type;
    return (
        formFields.find((field) => typeOf(field) === 'email') ??
        formFields.find(
            (field) =>
                !field.isPassword && (typeOf(field) === undefined || typeOf(field) === 'text'),
        )
    );
}
