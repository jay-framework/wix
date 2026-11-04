// @vitest-environment node

/**
 * DL#43 §Design 0: the caller client is a headers-only `createClient`, with no OAuth strategy.
 * Bug (DL#42): the OAuthStrategy caller client renews an expired access token and, when renewal
 * is impossible, falls back to an anonymous grant — an expired member silently becomes a new visitor.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearClientInitData, setClientInitData } from '@jay-framework/stack-server-runtime';
import type { Tokens } from '@wix/sdk';
import { items } from '@wix/data';
import {
    EXPIRY_MARGIN_SECONDS,
    isExpiringSoon,
    resolveRequestIdentity,
} from '../../lib/session/request-identity.js';
import { encodeSessionCookie, WIX_SESSION_COOKIE } from '../../lib/session/session-cookie.js';
import { fetchReturning, SITE_CLIENT_ID, tokenInfoFixture } from './fixtures.js';

const ACCESS_TOKEN = 'member-access';
const REFRESH_TOKEN = 'member-refresh';
const UNSUPPORTED_SURFACE_MESSAGE =
    'Not supported on the caller client: use client.use(module), client.graphql or wixFetch(..., { authorization })';

function nowInSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function cookiesWithExpiry(expiresAt: unknown): Record<string, string> {
    const tokens = {
        accessToken: { value: ACCESS_TOKEN, expiresAt },
        refreshToken: { value: REFRESH_TOKEN, role: 'member' },
    } as unknown as Tokens;
    return { [WIX_SESSION_COOKIE]: encodeSessionCookie(tokens) };
}

function activeCookies(): Record<string, string> {
    return cookiesWithExpiry(nowInSeconds() + 3600);
}

/** A global fetch that answers every Wix call with an empty JSON body and records the calls. */
function stubWixFetch() {
    const fetchMock = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit) =>
            new Response(JSON.stringify({ dataItems: [], pagingMetadata: {}, data: {} }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function requestedUrls(fetchMock: ReturnType<typeof stubWixFetch>): string[] {
    return fetchMock.mock.calls.map(([url]) => String(url));
}

function authorizationHeaderOf(init: RequestInit | undefined): string | undefined {
    return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

beforeEach(() => {
    setClientInitData('wix-server-client', { oauthClientId: SITE_CLIENT_ID });
});

afterEach(() => {
    clearClientInitData();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('isExpiringSoon (DL#43 §Design 0)', () => {
    it('is the single 60 s margin: true at now + 59, false at now + 61', () => {
        const now = 1_000_000;
        expect([
            EXPIRY_MARGIN_SECONDS,
            isExpiringSoon(now + 59, now),
            isExpiringSoon(now + 61, now),
        ]).toEqual([60, true, false]);
    });
});

describe('resolveRequestIdentity session state (DL#43 §Design 0)', () => {
    it.each([
        ['missing', undefined],
        ['non-finite', Number.NaN],
        ['a string', 'soon'],
    ])('should treat a cookie with a %s expiresAt as session none', async (_label, expiresAt) => {
        const identity = resolveRequestIdentity(cookiesWithExpiry(expiresAt));

        expect({
            session: identity.session,
            client: identity.client,
            authorization: identity.authorization,
            expiresAt: identity.expiresAt,
            caller: await identity.caller,
        }).toEqual({
            session: 'none',
            client: undefined,
            authorization: undefined,
            expiresAt: undefined,
            caller: undefined,
        });
    });

    it('should give an active session a client, authorization equal to the token, and expiresAt', () => {
        const expiresAt = nowInSeconds() + 3600;

        const identity = resolveRequestIdentity(cookiesWithExpiry(expiresAt));

        expect({
            session: identity.session,
            authorization: identity.authorization,
            expiresAt: identity.expiresAt,
            hasClient: identity.client !== undefined,
        }).toEqual({ session: 'active', authorization: ACCESS_TOKEN, expiresAt, hasClient: true });
    });

    it('an expired member token never triggers the anonymous grant and never posts as a visitor', async () => {
        const fetchMock = stubWixFetch();
        const expiresAt = nowInSeconds() + 30;

        const identity = resolveRequestIdentity(cookiesWithExpiry(expiresAt), fetchMock as any);

        expect({
            session: identity.session,
            client: identity.client,
            authorization: identity.authorization,
            expiresAt: identity.expiresAt,
            caller: await identity.caller,
        }).toEqual({
            session: 'expired',
            client: undefined,
            authorization: undefined,
            expiresAt,
            caller: undefined,
        });
        expect(requestedUrls(fetchMock)).toEqual([]);
    });

    it('building an identity does not read siteOAuthClientId; reading caller does', async () => {
        clearClientInitData();
        const fetchImpl = fetchReturning(tokenInfoFixture('active-member'));

        const identity = resolveRequestIdentity(activeCookies(), fetchImpl);

        expect(identity.session).toEqual('active');
        expect(() => identity.caller).toThrow('wix-server-client: no OAuth client id');
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe('the caller client (DL#43 §Design 0)', () => {
    it('has no OAuth strategy: client.auth.getAuthHeaders() returns empty headers', async () => {
        const identity = resolveRequestIdentity(activeCookies());

        expect(await (identity.client!.auth as any).getAuthHeaders()).toEqual({ headers: {} });
    });

    it('client.use(items) still works after stubbing and sends Authorization equal to the token', async () => {
        const fetchMock = stubWixFetch();
        const identity = resolveRequestIdentity(activeCookies());

        await identity.client!.use(items).query('Notes').find();

        expect(fetchMock.mock.calls.map(([, init]) => authorizationHeaderOf(init))).toEqual([
            ACCESS_TOKEN,
        ]);
    });

    it('a token that lapses mid-request never reaches /oauth2/token', async () => {
        const fetchMock = stubWixFetch();
        vi.useFakeTimers({ toFake: ['Date'] });
        const identity = resolveRequestIdentity(activeCookies());
        vi.setSystemTime(Date.now() + 3661 * 1000);

        await identity.client!.use(items).query('Notes').find();

        expect({
            authorizations: fetchMock.mock.calls.map(([, init]) => authorizationHeaderOf(init)),
            tokenCalls: requestedUrls(fetchMock).filter((url) => url.includes('/oauth2/token')),
        }).toEqual({ authorizations: [ACCESS_TOKEN], tokenCalls: [] });
    });

    it('client.graphql sends Authorization equal to the token', async () => {
        const fetchMock = stubWixFetch();
        const identity = resolveRequestIdentity(activeCookies());

        await identity.client!.graphql('query { ping }');

        expect(fetchMock.mock.calls.map(([, init]) => authorizationHeaderOf(init))).toEqual([
            ACCESS_TOKEN,
        ]);
    });

    it('fetchWithAuth, fetch and enableContext throw and never send a request or register a context', () => {
        const fetchMock = stubWixFetch();
        const contextBefore = (globalThis as any).__wix_context__;
        const client = resolveRequestIdentity(activeCookies()).client!;

        const errors = [
            () => client.fetchWithAuth('https://www.wixapis.com/x'),
            () => (client as any).fetch('/x'),
            () => client.enableContext('global'),
        ].map((call) => {
            try {
                call();
                return 'did not throw';
            } catch (error) {
                return (error as Error).message;
            }
        });

        expect(errors).toEqual([
            UNSUPPORTED_SURFACE_MESSAGE,
            UNSUPPORTED_SURFACE_MESSAGE,
            UNSUPPORTED_SURFACE_MESSAGE,
        ]);
        expect(fetchMock).not.toHaveBeenCalled();
        expect((globalThis as any).__wix_context__).toBe(contextBefore);
    });

});
