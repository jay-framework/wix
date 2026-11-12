import { describe, expect, it } from 'vitest';
import { serverAuthStrategy } from '../lib/server-auth';
import type { WixConfig } from '../lib/config-loader';

function userTokenConfig(userToken: { token: string; siteId?: string }): WixConfig {
    return { auth: { kind: 'userToken', userToken }, oauth: { clientId: 'c1' } };
}

describe('serverAuthStrategy', () => {
    it.each([
        [
            'with a site',
            { token: 't1', siteId: 's1' },
            { Authorization: 't1', 'wix-site-id': 's1' },
        ],
        ['without a site', { token: 't1' }, { Authorization: 't1' }],
    ])('sends a user token as the caller %s (DL #56)', async (_case, userToken, headers) => {
        const auth = serverAuthStrategy(userTokenConfig(userToken));
        expect(await auth.getAuthHeaders(undefined)).toEqual({ headers });
    });
});
