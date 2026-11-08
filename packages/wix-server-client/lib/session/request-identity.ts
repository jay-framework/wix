/**
 * Who is calling, read from the request's `wix_session` cookie (DL#42 §Design 1).
 * Server-only.
 */

import { createClient, OAuthStrategy, type WixClient } from '@wix/sdk';
import { decodeSessionCookie, WIX_SESSION_COOKIE } from './session-cookie.js';
import { siteOAuthClientId } from './site-oauth-client-id.js';
import { verifyAccessToken, type VerifiedCaller } from './verify-access-token.js';

export interface RequestIdentity {
    /** Verified lazily with token-info on first read; memoised for this request. */
    readonly caller: Promise<VerifiedCaller | undefined>;
    /** A Wix client acting as the caller; undefined without a session cookie. */
    client: WixClient | undefined;
}

export function resolveRequestIdentity(
    cookies: Record<string, string>,
    fetchImpl: typeof fetch = fetch,
): RequestIdentity {
    const tokens = decodeSessionCookie(cookies[WIX_SESSION_COOKIE]);
    if (!tokens) {
        return { caller: Promise.resolve(undefined), client: undefined };
    }
    const clientId = siteOAuthClientId();
    let verifiedCaller: Promise<VerifiedCaller | undefined> | undefined;
    return {
        get caller() {
            verifiedCaller ??= verifyAccessToken(tokens.accessToken.value, clientId, fetchImpl);
            return verifiedCaller;
        },
        client: createClient({ auth: OAuthStrategy({ clientId, tokens }) }),
    };
}
