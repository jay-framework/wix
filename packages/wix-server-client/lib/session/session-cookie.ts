/**
 * The `wix_session` cookie: a server-set mirror of the browser's access token (DL#42 Q22, DL#48).
 * Value: base64url JSON of `{ accessToken: { value, expiresAt } }`. The refresh token stays in the
 * browser: the server never renews (DL#43), so it has no reader for it.
 */

import type { CookieOptions } from '@jay-framework/fullstack-component';
import type { AccessToken } from '@wix/sdk';

export const WIX_SESSION_COOKIE = 'wix_session';

/** Max length of the encoded cookie value. DL#42 measured ~1070 characters for an access token. */
export const MAX_SESSION_COOKIE_LENGTH = 3072;

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

/**
 * `Secure` always (DL#48 Q2): browsers still accept it on `http://localhost`; other plain-http
 * hosts never keep the session. Max-Age outlives the 4 h access token on purpose: an expired
 * cookie reads as `session: 'expired'` (precise "refresh the page" copy, DL#43) instead of `'none'`.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: THIRTY_DAYS_IN_SECONDS,
};

/** clearCookie must use the same path the cookie was set with. */
export const SESSION_COOKIE_SCOPE = { path: SESSION_COOKIE_OPTIONS.path };

/** The cookie value for an access token; undefined when the token is malformed or the encoded value is too long. */
export function encodeSessionCookie(accessToken: unknown): string | undefined {
    const token = toAccessToken(accessToken);
    if (!token) return undefined;
    const value = Buffer.from(JSON.stringify({ accessToken: token })).toString('base64url');
    return value.length <= MAX_SESSION_COOKIE_LENGTH ? value : undefined;
}

/** The access token in a cookie value (a refresh token is ignored); undefined when missing, malformed or too long. */
export function decodeSessionCookie(value: string | undefined): AccessToken | undefined {
    if (!value || value.length > MAX_SESSION_COOKIE_LENGTH) return undefined;
    try {
        const json = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
        return toAccessToken(json?.accessToken);
    } catch {
        return undefined;
    }
}

/** A fresh `{ value, expiresAt }`, so no other field the browser sent survives (F10). */
function toAccessToken(raw: unknown): AccessToken | undefined {
    const { value, expiresAt } = (raw ?? {}) as Partial<Record<keyof AccessToken, unknown>>;
    const isReadable = typeof value === 'string' && value !== '' && Number.isFinite(expiresAt);
    return isReadable ? { value, expiresAt: expiresAt as number } : undefined;
}
