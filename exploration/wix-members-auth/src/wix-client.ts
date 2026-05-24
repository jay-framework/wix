import { createClient, OAuthStrategy, Tokens } from '@wix/sdk';

// TODO: Replace with your Wix Headless OAuth Client ID
// const OAUTH_CLIENT_ID = 'b0bc7aef-d666-4188-8f3c-e98b79da4191';
const OAUTH_CLIENT_ID = '7acebe4d-221d-45f1-8553-493478ea017f';

const TOKENS_STORAGE_KEY = 'wix_member_auth_tokens';

function storeTokens(tokens: Tokens): void {
    try {
        localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens));
    } catch (e) {
        console.warn('Failed to store tokens:', e);
    }
}

function getStoredTokens(): Tokens | null {
    try {
        const stored = localStorage.getItem(TOKENS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

export function clearStoredTokens(): void {
    localStorage.removeItem(TOKENS_STORAGE_KEY);
}

let client: ReturnType<typeof createClient> | null = null;

export async function initWixClient() {
    if (client) return client;

    const existingTokens = getStoredTokens();

    client = createClient({
        auth: OAuthStrategy({
            clientId: OAUTH_CLIENT_ID,
            tokens: existingTokens || undefined,
        }),
        modules: {},
    });

    if (!existingTokens) {
        console.log('Generating new visitor tokens...');
        const tokens = await client.auth.generateVisitorTokens();
        client.auth.setTokens(tokens);
        storeTokens(tokens);
        console.log('Visitor session created');
    } else {
        console.log('Resumed session, token role:', existingTokens.refreshToken?.role);
    }

    return client;
}

export function getClient() {
    if (!client) throw new Error('Call initWixClient() first');
    return client;
}

export function getCurrentTokens(): Tokens | null {
    return client?.auth.getTokens() ?? null;
}

export function isLoggedIn(): boolean {
    return client?.auth.loggedIn() ?? false;
}

async function exchangeSessionToken(
    c: ReturnType<typeof createClient>,
    sessionToken: string,
    context: string,
) {
    console.log(`[${context}] Got session token, exchanging for member tokens...`);
    console.log(`[${context}] Session token (first 50 chars):`, sessionToken.substring(0, 50));

    try {
        const tokenPromise = c.auth.getMemberTokensForDirectLogin(sessionToken);

        // Race against a timeout — this uses an iframe internally and may hang
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error('getMemberTokensForDirectLogin timed out after 10s')),
                10000,
            ),
        );

        const memberTokens = await Promise.race([tokenPromise, timeoutPromise]);
        console.log(`[${context}] Member tokens received!`);
        console.log(`[${context}] Token role:`, (memberTokens.refreshToken as any)?.role);
        console.log(
            `[${context}] Access token expires:`,
            memberTokens.accessToken?.expiresAt
                ? new Date(memberTokens.accessToken.expiresAt * 1000).toLocaleString()
                : 'N/A',
        );

        c.auth.setTokens(memberTokens);
        storeTokens(memberTokens);
        console.log(`[${context}] Member session established`);
    } catch (err) {
        console.error(`[${context}] Failed to exchange session token for member tokens:`, err);
        console.warn(
            `[${context}] Login succeeded but token upgrade failed. You may need to reload.`,
        );

        // Check if loggedIn() works even without the token exchange
        console.log(`[${context}] client.auth.loggedIn() =`, c.auth.loggedIn());
        console.log(
            `[${context}] Current tokens:`,
            JSON.stringify({
                role: (c.auth.getTokens()?.refreshToken as any)?.role,
                hasAccess: !!c.auth.getTokens()?.accessToken?.value,
            }),
        );
    }
}

export async function loginMember(email: string, password: string) {
    const c = getClient();
    console.log('Attempting login for:', email);

    const result = await c.auth.login({ email, password });
    console.log('Login state machine result:', JSON.stringify(result, null, 2));

    if (result.loginState === 'SUCCESS') {
        await exchangeSessionToken(c, result.data.sessionToken, 'login');
    }

    return result;
}

export async function registerMember(
    email: string,
    password: string,
    profile?: { firstName?: string; lastName?: string },
) {
    const c = getClient();
    console.log('Attempting registration for:', email);

    const result = await c.auth.register({ email, password, profile });
    console.log('Register state machine result:', JSON.stringify(result, null, 2));

    if (result.loginState === 'SUCCESS') {
        await exchangeSessionToken(c, result.data.sessionToken, 'registration');
    }

    return result;
}

export async function verifyEmail(verificationCode: string) {
    const c = getClient();
    console.log('Submitting email verification code...');

    const result = await c.auth.processVerification({ verificationCode });
    console.log('Verification result:', JSON.stringify(result, null, 2));

    if (result.loginState === 'SUCCESS') {
        await exchangeSessionToken(c, result.data.sessionToken, 'verification');
    }

    return result;
}

export async function sendPasswordReset(email: string) {
    const c = getClient();
    console.log('Sending password reset email to:', email);

    await c.auth.sendPasswordResetEmail(email, window.location.href);
    console.log('Password reset email sent');
}

export async function logoutMember() {
    const c = getClient();
    console.log('Logging out...');

    try {
        const { logoutUrl } = await c.auth.logout(window.location.href);
        console.log('Logout URL:', logoutUrl);
    } catch (e) {
        console.warn('Logout call failed (may be expected for visitor tokens):', e);
    }

    // Generate fresh visitor tokens
    const visitorTokens = await c.auth.generateVisitorTokens();
    c.auth.setTokens(visitorTokens);
    storeTokens(visitorTokens);
    console.log('Reverted to visitor session');
}
