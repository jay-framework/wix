import { createJayContext, registerGlobalContext } from '@jay-framework/runtime';
import { createClient, OAuthStrategy, Tokens, WixClient } from '@wix/sdk';
import { syncSession } from './actions/session-actions.js';

export interface WixClientContext {
    /** The Wix SDK client (null if OAuth not configured) */
    client: WixClient | null;
    /** Whether the client is ready for use */
    isReady: boolean;
    /** Get current tokens */
    getTokens(): Tokens | null;
    /** Generate new visitor tokens (creates new session) */
    generateVisitorTokens(): Promise<Tokens>;
    /**
     * Use these tokens from now on and keep them for later page loads (e.g. member tokens after a login).
     * Setting tokens on `client.auth` directly lasts only until the page reloads.
     */
    setTokens(tokens: Tokens): void;
    /** Refresh the access token using the refresh token */
    refreshToken(): Promise<Tokens>;
}

export const WIX_CLIENT_CONTEXT = createJayContext<WixClientContext>('wix:cc');

// ============================================================================
// Token Storage (client-only, but defined here for co-location)
// ============================================================================

const TOKENS_STORAGE_KEY = 'wix_visitor_tokens';

interface StoredTokens {
    tokens: Tokens;
    oauthClientId: string;
}

/**
 * Store tokens in localStorage for session persistence — the only code that persists them —
 * and mirror a changed access token into the server's `wix_session` cookie (DL#40 Q4).
 */
function storeTokens(tokens: Tokens, oauthClientId: string): void {
    try {
        localStorage.setItem(
            TOKENS_STORAGE_KEY + oauthClientId,
            JSON.stringify({ tokens, oauthClientId }),
        );
    } catch (error) {
        console.warn('[WixClient] Failed to store tokens:', error);
    }
    void syncSessionCookie(tokens);
}

// ============================================================================
// Session cookie mirror (DL#40): the browser owns the tokens, the cookie mirrors them.
// ============================================================================

/** The client-bound OAuth strategy: `getAuthHeaders()` renews an expired access token. */
type OAuthAuth = Pick<ReturnType<typeof OAuthStrategy>, 'getTokens' | 'setTokens'> & {
    getAuthHeaders(): unknown;
};

interface ActiveSession {
    auth: OAuthAuth;
    oauthClientId: string;
    /** The access token synced (or being synced) to the cookie in this page. */
    syncedAccessToken?: string;
    pendingSync: Promise<void>;
}

let activeSession: ActiveSession | undefined;

function syncSessionCookie(tokens: Tokens | null): Promise<void> {
    const accessToken = tokens?.accessToken?.value;
    if (!activeSession || !accessToken || accessToken === activeSession.syncedAccessToken) {
        return activeSession?.pendingSync ?? Promise.resolve();
    }
    const session = activeSession;
    session.syncedAccessToken = accessToken;
    session.pendingSync = syncSession({ tokens: tokens! }).then(
        () => undefined,
        () => {
            if (session.syncedAccessToken === accessToken) session.syncedAccessToken = undefined;
            // Never log the error itself: it may carry the request body (the tokens).
            console.warn('[WixClient] Could not sync the session cookie; retrying on the next change.');
        },
    );
    return session.pendingSync;
}

/**
 * Call before an action that depends on the `wix_session` cookie: renews an expired access
 * token, stores it, and waits until the cookie mirrors it. Logs and continues on failure;
 * never throws.
 */
export async function ensureSessionFresh(): Promise<void> {
    if (!activeSession) return;
    const { auth, oauthClientId } = activeSession;
    try {
        const before = auth.getTokens()?.accessToken?.value;
        await auth.getAuthHeaders(); // the SDK renews an expired token here
        const tokens = auth.getTokens();
        if (tokens?.accessToken?.value !== before) storeTokens(tokens, oauthClientId);
        await syncSessionCookie(tokens);
    } catch {
        console.warn('[WixClient] Could not refresh the session before the request.');
    }
}

/** Keep this tab's client in step when another tab stores new tokens (e.g. a logout). */
function followTokensFromOtherTabs(auth: OAuthAuth, oauthClientId: string): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', (event: StorageEvent) => {
        if (event.key !== TOKENS_STORAGE_KEY + oauthClientId || !event.newValue) return;
        try {
            const stored = JSON.parse(event.newValue) as StoredTokens;
            auth.setTokens(stored.tokens);
        } catch {
            // An unreadable entry from another tab: keep the current tokens.
        }
    });
}

/**
 * Retrieve stored visitor tokens from localStorage.
 */
function getStoredTokens(oauthClientId: string): StoredTokens | null {
    try {
        const stored = localStorage.getItem(TOKENS_STORAGE_KEY + oauthClientId);
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
export function clearStoredTokens(oauthClientId = ''): void {
    try {
        // Tokens are stored per OAuth client (see storeTokens).
        localStorage.removeItem(TOKENS_STORAGE_KEY + oauthClientId);
    } catch (error) {
        console.warn('[WixClient] Failed to clear tokens:', error);
    }
    if (activeSession) activeSession.syncedAccessToken = undefined;
    syncSession({ clear: true }).catch(() =>
        console.warn('[WixClient] Could not clear the session cookie.'),
    );
}

export async function provideWixClientContext(oauthClientId: string) {
    const storedTokens = getStoredTokens(oauthClientId);

    console.log('[wix-server-client] createClient with tokens: ', undefined);
    const wixClient = createClient({
        auth: OAuthStrategy({
            clientId: oauthClientId,
            tokens: storedTokens?.oauthClientId === oauthClientId ? storedTokens.tokens : undefined,
        }),
    });

    activeSession = { auth: wixClient.auth, oauthClientId, pendingSync: Promise.resolve() };
    followTokensFromOtherTabs(wixClient.auth, oauthClientId);

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

        setTokens(tokens: Tokens): void {
            wixClient.auth.setTokens(tokens);
            storeTokens(tokens, oauthClientId);
        },

        async refreshToken(): Promise<Tokens> {
            const currentTokens = wixClient.auth.getTokens();
            if (!currentTokens?.refreshToken) {
                throw new Error('No refresh token available');
            }
            const tokens = await wixClient.auth.renewToken(currentTokens.refreshToken);
            wixClient.auth.setTokens(tokens);
            storeTokens(tokens, oauthClientId);
            return tokens;
        },
    };

    registerGlobalContext(WIX_CLIENT_CONTEXT, clientContext);
}
