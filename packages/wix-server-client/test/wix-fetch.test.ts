// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient, type WixClient } from '@wix/sdk';
import { isPermissionDenied, WixApiError, wixFetch } from '../lib/wix-fetch.js';

const PATH = '/form-submission-service/v4/submissions';

function stubFetch(status = 200, body: unknown = {}) {
    const fetchMock = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit) =>
            new Response(JSON.stringify(body), {
                status,
                headers: { 'Content-Type': 'application/json' },
            }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function siteClientWithAuth() {
    const getAuthHeaders = vi.fn(async () => ({ headers: { Authorization: 'site-api-key' } }));
    const client = { auth: { getAuthHeaders } } as unknown as WixClient;
    return { client, getAuthHeaders };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('wixFetch authorization (DL#43 §Design 0)', () => {
    it('with the authorization option sends exactly that header and never mixes in the site client auth', async () => {
        const fetchMock = stubFetch();
        const { client, getAuthHeaders } = siteClientWithAuth();

        await wixFetch(client, PATH, { method: 'POST', body: {}, authorization: 'caller-token' });

        expect(fetchMock.mock.calls[0][1]!.headers).toEqual({
            Authorization: 'caller-token',
            'Content-Type': 'application/json',
        });
        expect(getAuthHeaders).not.toHaveBeenCalled();
    });

    it('without the option keeps posting with the site client auth headers', async () => {
        const fetchMock = stubFetch();
        const { client } = siteClientWithAuth();

        await wixFetch(client, PATH, { method: 'POST', body: {} });

        expect(fetchMock.mock.calls[0][1]!.headers).toEqual({
            Authorization: 'site-api-key',
            'Content-Type': 'application/json',
        });
    });

    it('on a headers-only client without authorization throws and never sends an unauthenticated request', async () => {
        const fetchMock = stubFetch();
        const headersOnlyClient = createClient({
            modules: {},
            headers: { Authorization: 'caller-token' },
        });

        await expect(wixFetch(headersOnlyClient, PATH, { method: 'POST' })).rejects.toThrow(
            `wixFetch: no Authorization for ${PATH}; pass the caller's authorization or use the site client`,
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('isPermissionDenied: HTTP 403 (DL#43 §Review 2026-11-09)', () => {
    it('is true for a wixFetch refusal with status 403', async () => {
        stubFetch(403, { message: 'forbidden' });
        const { client } = siteClientWithAuth();

        const refusal = await wixFetch(client, PATH, { method: 'POST' }).catch((error) => error);

        expect(isPermissionDenied(refusal)).toEqual(true);
    });

    it('is false for 401 (unauthenticated), 400, 428, 500 and network errors', () => {
        expect(
            [
                new WixApiError(401, PATH, '{}'),
                new WixApiError(400, PATH, '{}'),
                new WixApiError(
                    428,
                    PATH,
                    '{"details":{"applicationError":{"code":"INVALID_CAPTCHA"}}}',
                ),
                new WixApiError(500, PATH, ''),
                new TypeError('fetch failed'),
                undefined,
            ].map(isPermissionDenied),
        ).toEqual([false, false, false, false, false, false]);
    });
});

describe('wixFetch path guard (DL#49)', () => {
    const refusedPaths = [
        '/a/../b',
        '/a/%2E%2e/b',
        '/a/%2e/b',
        '/a#x',
        '/a?b=c#d',
        '/a/.\t./b',
        '/a\nb',
        '@evil.example/x',
        '.evil.example/x',
    ];

    it.each(refusedPaths)('refuses %j before reading credentials or fetching', async (path) => {
        const fetchMock = stubFetch();
        const { client, getAuthHeaders } = siteClientWithAuth();

        await expect(wixFetch(client, path)).rejects.toThrow(/unsafe request path/);
        expect(getAuthHeaders).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not echo the refused path in the error', async () => {
        stubFetch();
        const { client } = siteClientWithAuth();

        await expect(wixFetch(client, '/secret/../x')).rejects.not.toThrow(/secret/);
    });

    const allowedPaths = ['/a?b=c', '/a?q=a..b', '/members/v1/members/my?fieldsets=FULL'];

    it.each(allowedPaths)('allows %j', async (path) => {
        const fetchMock = stubFetch();
        const { client } = siteClientWithAuth();

        await wixFetch(client, path);
        expect(fetchMock).toHaveBeenCalledWith(`https://www.wixapis.com${path}`, expect.anything());
    });
});
