import type { ProjectValidationFinding, ProjectValidatorFn } from '@jay-framework/compiler-shared';
import {
    isSecretKey,
    isTokenKey,
    ruleMessage,
    ruleSuggestion,
    type CredentialRuleId,
} from './credential-rules';
import { findAuthPages, type CredentialScan, type StorageWrite } from './find-auth-pages';
import { loadJayConfigForCredentials } from './load-validation-suppressions';
import { TypeScriptMissingError } from './load-typescript';

/**
 * Project rules (Design Log #63): a reachable password reset, and no credentials or tokens in
 * Web Storage. Project validators get only `projectRoot`, so suppression is `.jay` only.
 */
export const validateCredentialsProject: ProjectValidatorFn = async ({ projectRoot }) => {
    let scan: CredentialScan;
    try {
        scan = await findAuthPages(projectRoot);
    } catch (error) {
        if (error instanceof TypeScriptMissingError) return [typescriptMissing()];
        throw error;
    }
    const { suppressions } = loadJayConfigForCredentials(projectRoot);
    const isActive = (rule: CredentialRuleId) => suppressions[rule] !== true;
    return [
        ...(isActive('no-password-reset') ? noPasswordReset(scan) : []),
        ...(isActive('secret-in-storage') ? secretInStorage(scan.storageWrites) : []),
        ...(isActive('token-in-storage') ? tokenInStorage(scan.storageWrites) : []),
    ];
};

function noPasswordReset(scan: CredentialScan): ProjectValidationFinding[] {
    const [firstLoginPage] = scan.loginCallers;
    if (!firstLoginPage || scan.projectCallsReset) return [];
    return [
        {
            severity: 'warning',
            file: firstLoginPage,
            message: ruleMessage(
                'no-password-reset',
                `This project logs members in with login() (${scan.loginCallers.join(', ')}) but no page calls sendPasswordReset(), so a member who forgets the password is locked out.`,
            ),
            suggestion: ruleSuggestion(
                'Add a "Forgot password?" page that calls sendPasswordReset(email), or suppress with validations: { wix-members: { no-password-reset: true } } in .jay if you rely on Wix-hosted reset.',
                'no-password-reset',
            ),
        },
    ];
}

function secretInStorage(writes: StorageWrite[]): ProjectValidationFinding[] {
    return writes
        .filter((write) => isSecretKey(write.key))
        .map((write) => ({
            severity: 'error' as const,
            file: write.file,
            message: ruleMessage(
                'secret-in-storage',
                `Line ${write.line} stores '${write.key}' in Web Storage; any script on the site can read it.`,
            ),
            suggestion: ruleSuggestion(
                'Never store passwords or secrets in the browser; let the password manager remember them.',
                'secret-in-storage',
            ),
        }));
}

function tokenInStorage(writes: StorageWrite[]): ProjectValidationFinding[] {
    return writes
        .filter((write) => !isSecretKey(write.key) && isTokenKey(write.key))
        .map((write) => ({
            severity: 'warning' as const,
            file: write.file,
            message: ruleMessage(
                'token-in-storage',
                `Line ${write.line} stores '${write.key}' in Web Storage; the member session is already persisted by the Wix client.`,
            ),
            suggestion: ruleSuggestion(
                'Remove it and read the session from the wix-members context. Suppress with validations: { wix-members: { token-in-storage: true } } in .jay if the key is not a credential.',
                'token-in-storage',
            ),
        }));
}

function typescriptMissing(): ProjectValidationFinding {
    return {
        severity: 'warning',
        file: 'package.json',
        message: ruleMessage(
            'typescript-missing',
            'credential validators skipped: install `typescript` as a dev dependency.',
        ),
        suggestion: ruleSuggestion('Run npm install -D typescript.', 'typescript-missing'),
    };
}
