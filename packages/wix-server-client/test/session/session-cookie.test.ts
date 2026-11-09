// @vitest-environment node

/**
 * DL#48 §Design 1: `wix_session` holds the access token only, as `{ accessToken: { value, expiresAt } }`,
 * with the encoded value capped at MAX_SESSION_COOKIE_LENGTH and `Secure` always set.
 */

import { describe, expect, it } from 'vitest';
import {
    decodeSessionCookie,
    encodeSessionCookie,
    MAX_SESSION_COOKIE_LENGTH,
    SESSION_COOKIE_OPTIONS,
} from '../../lib/session/session-cookie.js';

const ACCESS_TOKEN = { value: 'member-access', expiresAt: 1_900_000_000 };

function rawCookie(json: unknown): string {
    return Buffer.from(JSON.stringify(json)).toString('base64url');
}

function cookieJson(cookieValue: string): unknown {
    return JSON.parse(Buffer.from(cookieValue, 'base64url').toString('utf8'));
}

describe('session cookie (DL#48)', () => {
    it('should round-trip { value, expiresAt } with no refresh token in the cookie', () => {
        const cookieValue = encodeSessionCookie(ACCESS_TOKEN)!;

        expect(cookieJson(cookieValue)).toEqual({ accessToken: ACCESS_TOKEN });
        expect(decodeSessionCookie(cookieValue)).toEqual(ACCESS_TOKEN);
    });

    it('should decode an old { accessToken, refreshToken } cookie to its access token', () => {
        const oldCookie = rawCookie({
            accessToken: ACCESS_TOKEN,
            refreshToken: { value: 'member-refresh', role: 'member' },
        });

        expect(decodeSessionCookie(oldCookie)).toEqual(ACCESS_TOKEN);
    });

    it('should drop extra fields on the access token, both ways', () => {
        const withExtra = { ...ACCESS_TOKEN, injected: 'x'.repeat(10) };

        expect(cookieJson(encodeSessionCookie(withExtra)!)).toEqual({ accessToken: ACCESS_TOKEN });
        expect(decodeSessionCookie(rawCookie({ accessToken: withExtra }))).toEqual(ACCESS_TOKEN);
    });

    it.each([
        ['a non-string value', { value: 42, expiresAt: 1 }],
        ['an empty value', { value: '', expiresAt: 1 }],
        ['a non-finite expiresAt', { value: 'a', expiresAt: null }],
        ['a missing token', undefined],
    ])('should refuse %s, both ways', (_label, accessToken) => {
        expect(encodeSessionCookie(accessToken)).toBeUndefined();
        expect(decodeSessionCookie(rawCookie({ accessToken }))).toBeUndefined();
    });

    it('should refuse to encode a token whose encoded cookie value exceeds the cap', () => {
        const oversized = { value: 'a'.repeat(MAX_SESSION_COOKIE_LENGTH), expiresAt: 1 };

        expect(encodeSessionCookie(oversized)).toBeUndefined();
    });

    it('should ignore a cookie value one character over the cap', () => {
        const valid = encodeSessionCookie(ACCESS_TOKEN)!;
        const overCap = valid + 'A'.repeat(MAX_SESSION_COOKIE_LENGTH + 1 - valid.length);

        expect(overCap).toHaveLength(3073);
        expect(decodeSessionCookie(overCap)).toBeUndefined();
    });

    it('should set Secure always', () => {
        expect(SESSION_COOKIE_OPTIONS.secure).toBe(true);
    });
});
