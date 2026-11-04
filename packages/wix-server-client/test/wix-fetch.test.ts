// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient, type WixClient } from '@wix/sdk';
import { items } from '@wix/data';
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

/**
 * The SDK error for a refused data call, produced by driving `@wix/data` through the real SDK
 * against the WDE0027 / WDE0117 responses recorded in DL#43 V2 / V6.
 */
async function sdkDataErrorFor(code: string, status: number, message: string): Promise<unknown> {
    stubFetch(status, { message, details: { applicationError: { code, description: message } } });
    const client = createClient({ modules: { items }, headers: { Authorization: 'caller-token' } });
    try {
        await client.items.insert('Notes', { title: 'x' });
    } catch (error) {
        return error;
    } finally {
        vi.unstubAllGlobals();
    }
    throw new Error('expected the SDK call to be refused');
}

describe('isPermissionDenied (DL#43 §Design 1)', () => {
    it('is true for the WDE0027 SDK data error', async () => {
        const error = await sdkDataErrorFor(
            'WDE0027',
            403,
            'The current user does not have permissions to insert on the Notes collection.',
        );

        expect(isPermissionDenied(error)).toEqual(true);
    });

    it('is false for WDE0117, 400, 428, 500 and network errors', async () => {
        const invalidToken = await sdkDataErrorFor('WDE0117', 401, 'MetaSite not found');

        expect(
            [
                invalidToken,
                new WixApiError(400, PATH, '{}'),
                new WixApiError(428, PATH, '{"details":{"applicationError":{"code":"INVALID_CAPTCHA"}}}'),
                new WixApiError(500, PATH, ''),
                new TypeError('fetch failed'),
                undefined,
            ].map(isPermissionDenied),
        ).toEqual([false, false, false, false, false, false]);
    });

    it.skip('pending V2: WixApiError(401) / WixApiError(403) rows — not specified until forms-side V2 records the status', () => {});
});
