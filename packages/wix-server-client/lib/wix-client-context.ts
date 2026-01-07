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

/**
 * Store visitor tokens in localStorage for session persistence.
 */
function storeTokens(tokens: Tokens): void {
    try {
        localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens));
    } catch (error) {
        console.warn('[WixClient] Failed to store tokens:', error);
    }
}

/**
 * Retrieve stored visitor tokens from localStorage.
 */
function getStoredTokens(): Tokens | null {
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
    const existingTokens = getStoredTokens();

    const wixClient = createClient({
        auth: OAuthStrategy({
            clientId: oauthClientId,
            tokens: existingTokens || undefined,
        }),
    });

    // If no existing tokens, get the newly generated ones and store them
    if (!existingTokens) {
        try {
            const newTokens = await wixClient.auth.generateVisitorTokens();
            storeTokens(newTokens);
            console.log('[wix-server-client] New visitor session created');
        } catch (error) {
            console.error('[wix-server-client] Failed to generate visitor tokens:', error);
        }
    } else {
        console.log('[wix-server-client] Resumed existing visitor session');

        // Validate/refresh the token if needed
        try {
            const refreshedTokens = await wixClient.auth.generateVisitorTokens();
            storeTokens(refreshedTokens);
        } catch (error) {
            console.warn('[wix-server-client] Token refresh failed, creating new session:', error);
            const newTokens = await wixClient.auth.generateVisitorTokens();
            storeTokens(newTokens);
        }
    }

    // Register the client context
    const clientContext: WixClientContext = {
        client: wixClient,
        isReady: true,

        getTokens(): Tokens | null {
            if (!wixClient) return null;
            return wixClient.auth.getTokens();
        },

        async generateVisitorTokens(): Promise<Tokens> {
            if (!wixClient) {
                throw new Error('Wix client not initialized');
            }
            const tokens = await wixClient.auth.generateVisitorTokens();
            storeTokens(tokens);
            return tokens;
        },

        async refreshToken(): Promise<Tokens> {
            if (!wixClient) {
                throw new Error('Wix client not initialized');
            }
            const currentTokens = wixClient.auth.getTokens();
            if (!currentTokens?.refreshToken) {
                throw new Error('No refresh token available');
            }
            const tokens = await wixClient.auth.renewToken(currentTokens.refreshToken);
            storeTokens(tokens);
            return tokens;
        },
    };

    registerGlobalContext(WIX_CLIENT_CONTEXT, clientContext);
}