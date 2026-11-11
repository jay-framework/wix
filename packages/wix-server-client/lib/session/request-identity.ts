/**
 * Who is calling, read from the request's `wix_session` cookie (DL#42 §Design 1).
 * Server-only.
 *
 * The caller client is headers-only, with no OAuth strategy (DL#43 §Design 0): an OAuthStrategy
 * client renews an expired token and, failing that, falls back to an anonymous grant, which would
 * silently turn an expired member into a new visitor. With no strategy there is nothing to renew.
 */

import { createClient, type WixClient } from '@wix/sdk';
import { decodeSessionCookie, WIX_SESSION_COOKIE } from './session-cookie.js';
import { siteOAuthClientId } from './site-oauth-client-id.js';
import { verifyAccessToken, type VerifiedCaller } from './verify-access-token.js';

export type SessionState = 'none' | 'active' | 'expired';

export interface RequestIdentity {
    /** Verified lazily with token-info on first read; memoised for this request. */
    readonly caller: Promise<VerifiedCaller | undefined>;
    /**
     * Headers-only client acting as the caller; undefined unless session is 'active'.
     * Supported: `client.use(module)`, `client.graphql` and `wixFetch(..., { authorization })`;
     * `fetchWithAuth`, `fetch` and `enableContext` throw.
     */
    client: WixClient | undefined;
    /** 'expired' is not 'none': never fall back to the site on an expired session. */
    session: SessionState;
    /** The access-token value, for wixFetch's `authorization` option; set when 'active'. Never log it. */
    authorization?: string;
    /** Access-token expiry in epoch seconds; set for 'active' and 'expired'. */
    expiresAt?: number;
}

export const EXPIRY_MARGIN_SECONDS = 60;

/** The one expiry rule: a token expiring within the margin (or with no known expiry) is treated as expired. */
export function isExpiringSoon(
    expiresAt: number | undefined,
    nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
    return expiresAt === undefined || expiresAt < nowSeconds + EXPIRY_MARGIN_SECONDS;
}

export const UNSUPPORTED_CALLER_CLIENT_MESSAGE =
    'Not supported on the caller client: use client.use(module), client.graphql or wixFetch(..., { authorization })';

export function resolveRequestIdentity(
    cookies: Record<string, string>,
    fetchImpl: typeof fetch = fetch,
): RequestIdentity {
    const accessToken = decodeSessionCookie(cookies[WIX_SESSION_COOKIE]);
    if (!accessToken) {
        return { caller: Promise.resolve(undefined), client: undefined, session: 'none' };
    }
    const expiresAt = accessToken.expiresAt;
    if (isExpiringSoon(expiresAt)) {
        return {
            caller: Promise.resolve(undefined),
            client: undefined,
            session: 'expired',
            expiresAt,
        };
    }
    const authorization = accessToken.value;
    let verifiedCaller: Promise<VerifiedCaller | undefined> | undefined;
    return {
        get caller() {
            verifiedCaller ??= verifyAccessToken(authorization, siteOAuthClientId(), fetchImpl);
            return verifiedCaller;
        },
        client: createCallerClient(authorization),
        session: 'active',
        authorization,
        expiresAt,
    };
}

function createCallerClient(authorization: string): WixClient {
    const client = createClient({ modules: {}, headers: { Authorization: authorization } });
    const unsupported = () => {
        throw new Error(UNSUPPORTED_CALLER_CLIENT_MESSAGE);
    };
    // Assigned on the client itself: a spread copy would freeze the `auth` getter and break `this`.
    client.fetchWithAuth = unsupported;
    (client as { fetch: unknown }).fetch = unsupported;
    client.enableContext = unsupported;
    return client;
}
