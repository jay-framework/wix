import type { Tokens } from '@wix/sdk';

/** The OAuthStrategy auth methods `memberAccessToken` uses. */
export interface AccessTokenAuth {
    loggedIn(): boolean;
    getTokens(): Tokens;
    /** The current access token, renewed first when it expired. */
    getAuthHeaders(): Promise<{ headers: { Authorization: string } }>;
}

/**
 * The logged-in member's access token, renewed when it expired, or undefined for a visitor. A renewed token is
 * handed to `keep` so later page loads use it.
 */
export async function memberAccessToken(auth: AccessTokenAuth, keep: (tokens: Tokens) => void): Promise<string | undefined> {
    if (!auth.loggedIn()) return undefined;
    const before = auth.getTokens().accessToken?.value;
    const { headers } = await auth.getAuthHeaders();
    if (headers.Authorization !== before) keep(auth.getTokens());
    return headers.Authorization || undefined;
}
