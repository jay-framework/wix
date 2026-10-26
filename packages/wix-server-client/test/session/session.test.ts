// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearClientInitData, setClientInitData } from '@jay-framework/stack-server-runtime';
import type { CookieOptions } from '@jay-framework/fullstack-component';
import type { Tokens } from '@wix/sdk';
import { syncSession } from '../../lib/actions/session-actions.js';
import { resolveRequestIdentity } from '../../lib/session/request-identity.js';
import { encodeSessionCookie, WIX_SESSION_COOKIE } from '../../lib/session/session-cookie.js';
import { fetchReturning, SITE_CLIENT_ID, tokenInfoFixture } from './fixtures.js';

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

function tokensFor(accessToken: string): Tokens {
    return {
        accessToken: { value: accessToken, expiresAt: Math.floor(Date.now() / 1000) + 3600 },
        refreshToken: { value: `refresh-of-${accessToken}`, role: 'member' },
    } as Tokens;
}

/** A stand-in for jay's ActionRequest that records what the handler set. */
function fakeRequest(cookies: Record<string, string> = {}) {
    const calls: Array<
        | { setCookie: [string, string, CookieOptions | undefined] }
        | { clearCookie: [string, unknown] }
    > = [];
    return {
        calls,
        request: {
            cookies,
            setCookie: (name: string, value: string, options?: CookieOptions) =>
                void calls.push({ setCookie: [name, value, options] }),
            clearCookie: (name: string, options?: unknown) =>
                void calls.push({ clearCookie: [name, options] }),
        },
    };
}

beforeEach(() => {
    setClientInitData('wix-server-client', { oauthClientId: SITE_CLIENT_ID });
});

afterEach(() => {
    clearClientInitData();
    vi.unstubAllGlobals();
});

describe('syncSession (V13)', () => {
    it('should set an httpOnly Lax wix_session cookie for a verified token', async () => {
        vi.stubGlobal('fetch', fetchReturning(tokenInfoFixture('active-member')));
        const tokens = tokensFor('member-access');
        const { request, calls } = fakeRequest();

        const result = await syncSession.handler({ tokens }, request);

        expect(result).toEqual({ ok: true, callerType: 'MEMBER' });
        expect(calls).toEqual([
            {
                setCookie: [
                    WIX_SESSION_COOKIE,
                    encodeSessionCookie(tokens),
                    { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: THIRTY_DAYS_IN_SECONDS },
                ],
            },
        ]);
    });

    it('should clear the cookie when the token fails a check', async () => {
        vi.stubGlobal('fetch', fetchReturning(tokenInfoFixture('invalid-made-up-jwt')));
        const { request, calls } = fakeRequest();

        const result = await syncSession.handler({ tokens: tokensFor('forged') }, request);

        expect(result).toEqual({ ok: false });
        expect(calls).toEqual([{ clearCookie: [WIX_SESSION_COOKIE, { path: '/' }] }]);
    });

    it('should clear the cookie on { clear: true } without calling token-info', async () => {
        const fetchImpl = fetchReturning(tokenInfoFixture('active-member'));
        vi.stubGlobal('fetch', fetchImpl);
        const { request, calls } = fakeRequest();

        const result = await syncSession.handler({ clear: true }, request);

        expect(result).toEqual({ ok: true });
        expect(calls).toEqual([{ clearCookie: [WIX_SESSION_COOKIE, { path: '/' }] }]);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('should propagate a token-info outage and set no cookie', async () => {
        vi.stubGlobal('fetch', fetchReturning({ status: 503, body: {} }));
        const { request, calls } = fakeRequest();

        await expect(syncSession.handler({ tokens: tokensFor('a') }, request)).rejects.toThrow(
            'Wix API 503: /oauth2/token-info',
        );
        expect(calls).toEqual([]);
    });
});

describe('resolveRequestIdentity (V13)', () => {
    it.each([
        ['no cookie', {}],
        ['a garbled cookie', { [WIX_SESSION_COOKIE]: '%%%not-base64-json' }],
        ['a cookie without an access token', { [WIX_SESSION_COOKIE]: Buffer.from('{}').toString('base64url') }],
    ])('should give no caller and no client for %s, without fetching', async (_label, cookies) => {
        const fetchImpl = fetchReturning(tokenInfoFixture('active-member'));

        const identity = resolveRequestIdentity(cookies, fetchImpl);

        expect({ caller: await identity.caller, client: identity.client }).toEqual({
            caller: undefined,
            client: undefined,
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('should build a client that sends the cookie access token as Authorization', async () => {
        const cookies = { [WIX_SESSION_COOKIE]: encodeSessionCookie(tokensFor('member-access')) };

        const identity = resolveRequestIdentity(cookies, fetchReturning(tokenInfoFixture('active-member')));
        const authHeaders = await (identity.client!.auth as any).getAuthHeaders();

        expect(authHeaders.headers.Authorization).toEqual('member-access');
    });

    it('should verify the caller with exactly one token-info call, even when awaited twice', async () => {
        const fetchImpl = fetchReturning(tokenInfoFixture('active-member'));
        const cookies = { [WIX_SESSION_COOKIE]: encodeSessionCookie(tokensFor('member-access')) };

        const identity = resolveRequestIdentity(cookies, fetchImpl);
        expect(fetchImpl).not.toHaveBeenCalled(); // lazy: nothing until `caller` is read
        const callers = [await identity.caller, await identity.caller];

        expect(callers).toEqual([
            { type: 'MEMBER', id: '<MEMBER_ID>' },
            { type: 'MEMBER', id: '<MEMBER_ID>' },
        ]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchImpl.mock.calls[0][1]!.body as string)).toEqual({
            token: 'member-access',
        });
    });

    it('should give an undefined caller but still a client for a token that fails a check', async () => {
        const cookies = { [WIX_SESSION_COOKIE]: encodeSessionCookie(tokensFor('expired')) };

        const identity = resolveRequestIdentity(cookies, fetchReturning(tokenInfoFixture('invalid-non-jwt')));

        expect(await identity.caller).toBeUndefined();
        expect(identity.client).toBeDefined();
    });
});
