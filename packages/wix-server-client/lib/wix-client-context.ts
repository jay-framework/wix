import {createJayContext, registerGlobalContext} from "@jay-framework/runtime";
import {createClient, OAuthStrategy, Tokens, WixClient} from "@wix/sdk";

export interface WixClientContext {
    /** The Wix SDK client (null if OAuth not configured) */
    client: WixClient | null;
    /** Whether the client is ready for use */
    isReady: boolean;
    /** Get current tokens */
    getTokens(): Tokens | null;
    /** Generate new visitor tokens (creates new session) */
    generateVisitorTokens(): Promise<Tokens>;
    /** Refresh the access token using the refresh token */
    refreshToken(): Promise<Tokens>;
}

export const WIX_CLIENT_CONTEXT = createJayContext<WixClientContext>();

// ============================================================================
// Token Storage (client-only, but defined here for co-location)
// ============================================================================

const TOKENS_STORAGE_KEY = 'wix_visitor_tokens';

interface StoredTokens {
    tokens: Tokens,
    oauthClientId: string
}

/**
 * Store visitor tokens in localStorage for session persistence.
 */
function storeTokens(tokens: Tokens, oauthClientId: string): void {
    try {
        localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify({tokens, oauthClientId}));
    } catch (error) {
        console.warn('[WixClient] Failed to store tokens:', error);
    }
}

/**
 * Retrieve stored visitor tokens from localStorage.
 */
function getStoredTokens(): StoredTokens | null {
    try {
        const stored = localStorage.getItem(TOKENS_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.warn('[WixClient] Failed to retrieve tokens:', error);
    }
    return null;
}

/**
 * Clear stored tokens (for logout or session reset).
 */
export function clearStoredTokens(): void {
    try {
        localStorage.removeItem(TOKENS_STORAGE_KEY);
    } catch (error) {
        console.warn('[WixClient] Failed to clear tokens:', error);
    }
}

export async function provideWixClientContext(oauthClientId: string) {
    const storedTokens = getStoredTokens();

    console.log('[wix-server-client] createClient with tokens: ', undefined);
    const wixClient = createClient({
        auth: OAuthStrategy({
            clientId: oauthClientId,
            tokens: (storedTokens?.oauthClientId === oauthClientId)?storedTokens.tokens: undefined,
        }),
    });

    if (!storedTokens || !storedTokens?.oauthClientId) {
        const tokens = await wixClient.auth.generateVisitorTokens();
        wixClient.auth.setTokens(tokens);
        storeTokens(tokens, oauthClientId);
    }

    const clientContext: WixClientContext = {
        client: wixClient,
        isReady: true,

        getTokens(): Tokens | null {
            return wixClient.auth.getTokens();
        },

        async generateVisitorTokens(): Promise<Tokens> {
            const tokens = await wixClient.auth.generateVisitorTokens();
            storeTokens(tokens, oauthClientId);
            return tokens;
        },

        async refreshToken(): Promise<Tokens> {
            const currentTokens = wixClient.auth.getTokens();
            if (!currentTokens?.refreshToken) {
                throw new Error('No refresh token available');
            }
            const tokens = await wixClient.auth.renewToken(currentTokens.refreshToken);
            storeTokens(tokens, oauthClientId);
            return tokens;
        },
    };

    registerGlobalContext(WIX_CLIENT_CONTEXT, clientContext);
}