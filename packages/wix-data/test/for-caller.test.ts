// @vitest-environment node

/** DL#41 §Design 3: `WixDataService.forCaller(identity)` — opt-in caller-scoped items, never the site. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearClientInitData, setClientInitData } from '@jay-framework/stack-server-runtime';
import {
    resolveRequestIdentity,
    WIX_SESSION_COOKIE,
    type RequestIdentity,
} from '@jay-framework/wix-server-client';
import type { WixClient } from '@wix/sdk';
import { NoCallerSessionError, provideWixDataService } from '../lib/services/wix-data-service';
import type { WixDataConfig } from '../lib/types';

const SITE_ITEMS = { marker: 'site-items' };
const CONFIG = { collections: [] } as unknown as WixDataConfig;

function siteClient(): WixClient {
    return { use: vi.fn(() => SITE_ITEMS) } as unknown as WixClient;
}

function cookiesExpiringIn(seconds: number): Record<string, string> {
    const tokens = {
        accessToken: { value: 'member-access', expiresAt: Math.floor(Date.now() / 1000) + seconds },
        refreshToken: { value: 'member-refresh', role: 'member' },
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

describe('WixDataService.forCaller (DL#41 §Design 3)', () => {
    it('throws NoCallerSessionError without a session', () => {
        const service = provideWixDataService(siteClient(), CONFIG);

        expect(noCallerReasonOf(() => service.forCaller(resolveRequestIdentity({})))).toEqual('none');
    });

    it('uses the caller client, not the site singleton', () => {
        const service = provideWixDataService(siteClient(), CONFIG);
        const identity = resolveRequestIdentity(cookiesExpiringIn(3600));
        const callerItems = { marker: 'caller-items' };
        const use = vi.spyOn(identity.client!, 'use').mockReturnValue(callerItems as never);

        const items = service.forCaller(identity);

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

        expect(noCallerReasonOf(() => service.forCaller(resolveRequestIdentity(cookiesExpiringIn(30))))).toEqual(
            'expired',
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a detached handler call (empty cookies) gives NoCallerSessionError('none')", () => {
        const service = provideWixDataService(siteClient(), CONFIG);
        const detachedRequestCookies: Record<string, string> = {};

        expect(noCallerReasonOf(() => service.forCaller(resolveRequestIdentity(detachedRequestCookies)))).toEqual(
            'none',
        );
    });

    it('works without server init (siteOAuthClientId is not read)', () => {
        clearClientInitData();
        const service = provideWixDataService(siteClient(), CONFIG);
        const identity: RequestIdentity = resolveRequestIdentity(cookiesExpiringIn(3600));

        expect(typeof service.forCaller(identity).query).toEqual('function');
    });
});
