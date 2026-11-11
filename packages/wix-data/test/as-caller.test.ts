// @vitest-environment node

/** DL#43 §Design 3: `WixDataService.asCaller(identity)` — opt-in caller-scoped items, never the site. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearClientInitData, setClientInitData } from '@jay-framework/stack-server-runtime';
import {
    resolveRequestIdentity,
    WIX_SESSION_COOKIE,
    type RequestIdentity,
} from '@jay-framework/wix-server-client';
import { createClient, type WixClient } from '@wix/sdk';
import { items } from '@wix/data';
import {
    isDataPermissionDenied,
    NoCallerSessionError,
    provideWixDataService,
} from '../lib/services/wix-data-service';
import type { WixDataConfig } from '../lib/types';

const SITE_ITEMS = { marker: 'site-items' };
const CONFIG = { collections: [] } as unknown as WixDataConfig;

function siteClient(): WixClient {
    return { use: vi.fn(() => SITE_ITEMS) } as unknown as WixClient;
}

function cookiesExpiringIn(seconds: number): Record<string, string> {
    const tokens = {
        accessToken: { value: 'member-access', expiresAt: Math.floor(Date.now() / 1000) + seconds },
    };
    return { [WIX_SESSION_COOKIE]: Buffer.from(JSON.stringify(tokens)).toString('base64url') };
}

function noCallerReasonOf(call: () => unknown): string {
    try {
        call();
        return 'did not throw';
    } catch (error) {
        return error instanceof NoCallerSessionError ? error.reason : `other error: ${error}`;
    }
}

beforeEach(() => {
    setClientInitData('wix-server-client', { oauthClientId: '<OAUTH_CLIENT_ID>' });
});

afterEach(() => {
    clearClientInitData();
    vi.unstubAllGlobals();
});

describe('WixDataService.asCaller (DL#43 §Design 3)', () => {
    it('throws NoCallerSessionError without a session', () => {
        const service = provideWixDataService(siteClient(), CONFIG);

        expect(noCallerReasonOf(() => service.asCaller(resolveRequestIdentity({})))).toEqual(
            'none',
        );
    });

    it('uses the caller client, not the site singleton', () => {
        const service = provideWixDataService(siteClient(), CONFIG);
        const identity = resolveRequestIdentity(cookiesExpiringIn(3600));
        const callerItems = { marker: 'caller-items' };
        const use = vi.spyOn(identity.client!, 'use').mockReturnValue(callerItems as never);

        const items = service.asCaller(identity);

        expect({ items, siteItems: service.items, useCalls: use.mock.calls.length }).toEqual({
            items: callerItems,
            siteItems: SITE_ITEMS,
            useCalls: 1,
        });
    });

    it("with an expired session throws NoCallerSessionError('expired') and never triggers the anonymous grant", () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const service = provideWixDataService(siteClient(), CONFIG);

        expect(
            noCallerReasonOf(() => service.asCaller(resolveRequestIdentity(cookiesExpiringIn(30)))),
        ).toEqual('expired');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a detached handler call (empty cookies) gives NoCallerSessionError('none')", () => {
        const service = provideWixDataService(siteClient(), CONFIG);
        const detachedRequestCookies: Record<string, string> = {};

        expect(
            noCallerReasonOf(() =>
                service.asCaller(resolveRequestIdentity(detachedRequestCookies)),
            ),
        ).toEqual('none');
    });

    it('works without server init (siteOAuthClientId is not read)', () => {
        clearClientInitData();
        const service = provideWixDataService(siteClient(), CONFIG);
        const identity: RequestIdentity = resolveRequestIdentity(cookiesExpiringIn(3600));

        expect(typeof service.asCaller(identity).query).toEqual('function');
    });
});

/** The error `@wix/data` throws when Wix answers with this status and Wix Data error code. */
async function dataErrorFor(status: number, code: string): Promise<unknown> {
    const body = { message: code, details: { applicationError: { code, description: code } } };
    vi.stubGlobal(
        'fetch',
        vi.fn(
            async () =>
                new Response(JSON.stringify(body), {
                    status,
                    headers: { 'Content-Type': 'application/json' },
                }),
        ),
    );
    const client = createClient({ modules: { items }, headers: { Authorization: 'caller-token' } });
    try {
        await client.items.insert('Notes', { title: 'x' });
    } catch (error) {
        return error;
    }
    throw new Error('expected the data call to be refused');
}

describe('isDataPermissionDenied (DL#43 §Review 2026-11-09, documented Wix Data error codes)', () => {
    it('is true for WDE0027 (no permission) and WDE0177 (no permission in sandbox)', async () => {
        const refusals = [await dataErrorFor(403, 'WDE0027'), await dataErrorFor(403, 'WDE0177')];

        expect(refusals.map(isDataPermissionDenied)).toEqual([true, true]);
    });

    it('is false for WDE0117 (site not resolved), other codes, plain errors and undefined', async () => {
        const others = [
            await dataErrorFor(401, 'WDE0117'),
            await dataErrorFor(400, 'WDE0080'),
            new TypeError('fetch failed'),
            undefined,
        ];

        expect(others.map(isDataPermissionDenied)).toEqual([false, false, false, false]);
    });
});
