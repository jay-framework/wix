/**
 * Wix Client setup using OAuth Strategy
 * 
 * This creates a Wix client for browser use with OAuth visitor authentication.
 * Modules are initialized with the client for type-safe access.
 * 
 * @see https://dev.wix.com/docs/go-headless/develop-your-project/self-managed-headless/authentication/visitors/handle-visitors-using-the-js-sdk
 */

import { createClient, OAuthStrategy, Tokens } from "@wix/sdk";
import { productsV3 } from "@wix/stores";
import { currentCart } from "@wix/ecom";

// ============================================================================
// Configuration
// ============================================================================

// OAuth Client ID - get this from your Wix Headless project settings
// See: https://dev.wix.com/docs/go-headless/develop-your-project/self-managed-headless/authentication/visitors/handle-visitors-using-the-js-sdk
const OAUTH_CLIENT_ID: string = "b0bc7aef-d666-4188-8f3c-e98b79da4191";

// ============================================================================
// Token Storage (localStorage)
// ============================================================================

const TOKENS_STORAGE_KEY = 'wix_visitor_tokens';

/**
 * Store visitor tokens in localStorage for session persistence.
 */
export function storeTokens(tokens: Tokens): void {
    try {
        localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens));
    } catch (error) {
        console.warn('[WixClient] Failed to store tokens:', error);
    }
}

/**
 * Retrieve stored visitor tokens from localStorage.
 */
export function getStoredTokens(): Tokens | null {
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

// ============================================================================
// Wix Client with Modules
// ============================================================================

/**
 * Type for the Wix client with our specific modules.
 * This gives us type-safe access to products and cart APIs.
 */
export type WixStoresClient = ReturnType<typeof createWixClient>;

function createWixClient(authStrategy: ReturnType<typeof OAuthStrategy>) {
    return createClient({
        auth: authStrategy,
        modules: {
            productsV3,
            currentCart,
        },
    });
}

// Client instance
let wixClientInstance: WixStoresClient | null = null;
let authClient: ReturnType<typeof OAuthStrategy> | null = null;

/**
 * Initialize the Wix client with OAuth visitor authentication.
 * This should be called once when the page loads.
 * 
 * The client is created with modules pre-configured, so you can access:
 * - client.productsV3.queryProducts()
 * - client.currentCart.getCurrentCart()
 */
export async function initializeWixClient(): Promise<WixStoresClient> {
    if (wixClientInstance) {
        return wixClientInstance;
    }

    if (OAUTH_CLIENT_ID === "YOUR_OAUTH_CLIENT_ID_HERE") {
        throw new Error(
            "Please set your OAuth Client ID in src/wix-client.ts\n" +
            "Get it from your Wix Headless project settings."
        );
    }

    console.log('[WixClient] Initializing with OAuth...');
    
    // Check for existing tokens
    const existingTokens = getStoredTokens();
    
    // Create OAuth strategy
    authClient = OAuthStrategy({
        clientId: OAUTH_CLIENT_ID,
        tokens: existingTokens || undefined,
    });
    
    // Create the Wix client with modules
    wixClientInstance = createWixClient(authClient);

    // Generate new visitor tokens if none exist
    if (!existingTokens) {
        try {
            console.log('[WixClient] Generating new visitor tokens...');
            const tokens = await authClient.generateVisitorTokens();
            authClient.setTokens(tokens);
            storeTokens(tokens);
            console.log('[WixClient] New visitor session created');
        } catch (error) {
            console.error('[WixClient] Failed to generate visitor tokens:', error);
            throw error;
        }
    } else {
        console.log('[WixClient] Resumed existing visitor session');
    }

    return wixClientInstance;
}

/**
 * Get the Wix client instance.
 * Throws if not initialized.
 */
export function getWixClient(): WixStoresClient {
    if (!wixClientInstance) {
        throw new Error('Wix client not initialized. Call initializeWixClient() first.');
    }
    return wixClientInstance;
}

/**
 * Get current authentication tokens.
 */
export function getCurrentTokens(): Tokens | null {
    if (!authClient) {
        return null;
    }
    return authClient.getTokens();
}

/**
 * Refresh the access token using the refresh token.
 */
export async function refreshAccessToken(): Promise<Tokens> {
    if (!authClient) {
        throw new Error('Wix client not initialized');
    }
    
    const currentTokens = authClient.getTokens();
    
    if (!currentTokens?.refreshToken) {
        throw new Error('No refresh token available');
    }
    
    const newTokens = await authClient.renewToken(currentTokens.refreshToken);
    storeTokens(newTokens);
    return newTokens;
}
