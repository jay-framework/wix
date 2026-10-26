// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyAccessToken } from '../../lib/session/verify-access-token.js';
import { WixApiError } from '../../lib/wix-fetch.js';
import { fetchReturning, SITE_CLIENT_ID, tokenInfoFixture, withBody } from './fixtures.js';

const TOKEN = 'header.payload.signature';

describe('verifyAccessToken (V7)', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('should return a MEMBER caller for an active member token of this site', async () => {
        const fetchImpl = fetchReturning(tokenInfoFixture('active-member'));

        expect(await verifyAccessToken(TOKEN, SITE_CLIENT_ID, fetchImpl)).toEqual({
            type: 'MEMBER',
            id: '<MEMBER_ID>',
        });
    });

    it('should return a VISITOR caller for an active visitor token of this site', async () => {
        const fetchImpl = fetchReturning(tokenInfoFixture('active-visitor'));

        expect(await verifyAccessToken(TOKEN, SITE_CLIENT_ID, fetchImpl)).toEqual({
            type: 'VISITOR',
            id: '<VISITOR_ID>',
        });
    });

    it.each(['invalid-made-up-jwt', 'invalid-non-jwt', 'invalid-empty-string'])(
        'should return undefined for the inactive token answer %s',
        async (name) => {
            const fetchImpl = fetchReturning(tokenInfoFixture(name));

            expect(await verifyAccessToken(TOKEN, SITE_CLIENT_ID, fetchImpl)).toBeUndefined();
        },
    );

    it.each([
        ['active:false', { active: false }],
        ['a foreign clientId', { clientId: 'another-site-client' }],
        ['a missing clientId', { clientId: undefined }],
        ['subjectType APP', { subjectType: 'APP' }],
        ['an empty subjectId', { subjectId: '' }],
    ])('should return undefined for %s', async (_label, overrides) => {
        const fetchImpl = fetchReturning(withBody('active-member', overrides));

        expect(await verifyAccessToken(TOKEN, SITE_CLIENT_ID, fetchImpl)).toBeUndefined();
    });

    it('should not call token-info for an empty token', async () => {
        const fetchImpl = fetchReturning(tokenInfoFixture('active-member'));

        expect(await verifyAccessToken('', SITE_CLIENT_ID, fetchImpl)).toBeUndefined();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('should POST the token as JSON with no Authorization header', async () => {
        const fetchImpl = fetchReturning(tokenInfoFixture('active-member'));

        await verifyAccessToken(TOKEN, SITE_CLIENT_ID, fetchImpl);

        const [url, init] = fetchImpl.mock.calls[0];
        expect({ url, method: init?.method, headers: init?.headers, body: init?.body }).toEqual({
            url: 'https://www.wixapis.com/oauth2/token-info',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: TOKEN }),
        });
    });

    it('should abort token-info after 5 seconds', async () => {
        vi.useFakeTimers();
        const fetchImpl = vi.fn(
            (_url: string, init?: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
                }),
        );

        const verifying = verifyAccessToken(TOKEN, SITE_CLIENT_ID, fetchImpl);
        const outcome = verifying.then(
            () => 'resolved',
            () => 'rejected',
        );
        await vi.advanceTimersByTimeAsync(4999);
        expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);

        expect(await outcome).toBe('rejected');
    });

    it('should throw a WixApiError without the token for any non-200 answer', async () => {
        const fetchImpl = fetchReturning({ status: 503, body: { message: 'unavailable' } });

        const error = await verifyAccessToken(TOKEN, SITE_CLIENT_ID, fetchImpl).catch((e) => e);

        expect(error).toBeInstanceOf(WixApiError);
        expect({ status: error.status, path: error.path }).toEqual({
            status: 503,
            path: '/oauth2/token-info',
        });
        expect(JSON.stringify(error) + error.message + error.responseBody).not.toMatch(TOKEN);
    });

    it('should log nothing', async () => {
        const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((method) =>
            vi.spyOn(console, method),
        );

        await verifyAccessToken(TOKEN, SITE_CLIENT_ID, fetchReturning(tokenInfoFixture('active-member')));
        await verifyAccessToken(TOKEN, SITE_CLIENT_ID, fetchReturning({ status: 500, body: {} })).catch(
            () => {},
        );

        expect(spies.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0, 0, 0]);
    });
});
