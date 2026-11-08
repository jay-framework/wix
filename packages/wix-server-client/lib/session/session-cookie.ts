/**
 * The `wix_session` cookie: a server-set mirror of the browser's OAuth tokens (DL#42 Q22).
 * Value: base64url JSON of `{ accessToken, refreshToken }`.
 */

import type { CookieOptions } from '@jay-framework/fullstack-component';
import type { Tokens } from '@wix/sdk';

export const WIX_SESSION_COOKIE = 'wix_session';

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

/**
 * `Secure` is left to jay's default (set when the request is https), so the cookie also
 * works on `http://localhost`. Max-Age is an assumption: the refresh-token lifetime was not
 * measurable (DL#42 Implementation Results).
 */
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: THIRTY_DAYS_IN_SECONDS,
};

/** clearCookie must use the same path the cookie was set with. */
export const SESSION_COOKIE_SCOPE = { path: SESSION_COOKIE_OPTIONS.path };

export function encodeSessionCookie(tokens: Tokens): string {
    const { accessToken, refreshToken } = tokens;
    return Buffer.from(JSON.stringify({ accessToken, refreshToken })).toString('base64url');
}

/**
 * The tokens in a cookie value, or undefined for a missing or unreadable one — including an
 * access token without a finite `expiresAt` (DL#43 §Design 0).
 */
export function decodeSessionCookie(value: string | undefined): Tokens | undefined {
    if (!value) return undefined;
    try {
        const tokens = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Tokens;
        const accessToken = tokens?.accessToken;
        const isReadable =
            typeof accessToken?.value === 'string' &&
            accessToken.value !== '' &&
            Number.isFinite(accessToken.expiresAt);
        return isReadable ? tokens : undefined;
    } catch {
        return undefined;
    }
}
