// Shared vocabulary of the credential lifecycle validators (Design Log #63).

export const PLUGIN_KEY = 'wix-members';
export const GUIDE = 'agent-kit/plugin/wix-members-direct-login.md';

export type CredentialRuleId =
    | 'password-not-in-form'
    | 'password-type'
    | 'autocomplete-role'
    | 'identifier-autocomplete'
    | 'no-password-reset'
    | 'secret-in-storage'
    | 'token-in-storage'
    | 'typescript-missing';

export function ruleMessage(rule: CredentialRuleId, text: string): string {
    return `[${PLUGIN_KEY}/${rule}] ${text}`;
}

export function ruleSuggestion(text: string, section: string): string {
    return `${text} See ${GUIDE} → ${section}.`;
}

const PASSWORD_SEGMENTS = new Set(['password', 'passwd', 'pwd']);
const SECRET_SEGMENTS = new Set([...PASSWORD_SEGMENTS, 'secret']);

/** Splits `newPassword`, `confirm-password`, `api_access.key` into lowercase segments. */
export function nameSegments(name: string): string[] {
    return name
        .split(/[-_.\s]+/)
        .flatMap((part) => part.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? [])
        .map((segment) => segment.toLowerCase());
}

export function isPasswordName(name: string): boolean {
    return nameSegments(name).some((segment) => PASSWORD_SEGMENTS.has(segment));
}

export function isSecretKey(key: string): boolean {
    return nameSegments(key).some((segment) => SECRET_SEGMENTS.has(segment));
}

export function isTokenKey(key: string): boolean {
    const segments = nameSegments(key);
    if (segments.includes('token')) return true;
    return segments.some((segment, i) => segment === 'access' && segments[i + 1] === 'key');
}
