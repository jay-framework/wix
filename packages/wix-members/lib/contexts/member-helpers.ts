import type { LoginResult } from './wix-members-context.js';

const ERROR_MESSAGES: Record<string, string> = {
    invalidEmail: 'Invalid email address.',
    invalidPassword: 'Incorrect password.',
    resetPassword: 'You must reset your password before logging in.',
    emailAlreadyExists: 'An account with this email already exists.',
    missingCaptchaToken: 'CAPTCHA verification required.',
    invalidCaptchaToken: 'CAPTCHA verification failed. Please try again.',
};

export function mapErrorMessage(errorCode?: string): string {
    if (!errorCode) return 'An unexpected error occurred.';
    return ERROR_MESSAGES[errorCode] || `Login failed (${errorCode}).`;
}

export function mapLoginState(result: any): LoginResult {
    const mapped: LoginResult = {
        success: result.loginState === 'SUCCESS',
        state: result.loginState,
    };

    if (result.loginState === 'FAILURE') {
        mapped.errorCode = result.errorCode;
        mapped.errorMessage = mapErrorMessage(result.errorCode);
    }

    if (result.loginState === 'EMAIL_VERIFICATION_REQUIRED') {
        mapped.requiresEmailVerification = true;
        mapped.stateToken = result.data?.stateToken;
    }

    return mapped;
}
