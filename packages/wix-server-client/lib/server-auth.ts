import { ApiKeyStrategy, AppStrategy, OAuthStrategy } from '@wix/sdk';
import type { UserTokenConfig, WixConfig } from './config-loader';

const TOKEN_INFO_URL = 'https://www.wixapis.com/oauth2/token-info';

/** A user token's headers always build; ask Wix whether the token is still active. */
async function verifyUserToken({ token }: UserTokenConfig): Promise<void> {
    const response = await fetch(TOKEN_INFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error(`token info failed (${response.status})`);
    const info: { active?: boolean; subjectType?: string } = await response.json();
    if (!info.active) throw new Error('the user token is not active (expired?)');
}

/** PoC (DL #56): every call carries the contributor's own Wix user token. */
function userTokenStrategy({ token, siteId }: UserTokenConfig) {
    const headers: Record<string, string> = siteId
        ? { Authorization: token, 'wix-site-id': siteId }
        : { Authorization: token };
    return { getAuthHeaders: async (_host?: unknown) => ({ headers }) };
}

/** The @wix/sdk auth strategy the server client runs with, from the loaded config. */
export function serverAuthStrategy(config: WixConfig) {
    switch (config.auth.kind) {
        case 'visitor':
            return OAuthStrategy({ clientId: config.oauth.clientId });
        case 'apiKey':
            return ApiKeyStrategy({
                apiKey: config.auth.apiKey.apiKey,
                siteId: config.auth.apiKey.siteId,
            });
        case 'app':
            return AppStrategy({
                appId: config.auth.app.appId,
                appSecret: config.auth.app.appSecret,
                instanceId: config.auth.app.instanceId,
            });
        case 'userToken':
            return userTokenStrategy(config.auth.userToken);
    }
}

/**
 * Proves the configured server credentials can authenticate by asking the SDK for auth
 * headers — for appStrategy this is a real token request to Wix. Throws with a way forward.
 */
export async function verifyServerAuth(config: WixConfig): Promise<void> {
    try {
        // The host only matters inside a Wix-hosted runtime; a headless server has none.
        await serverAuthStrategy(config).getAuthHeaders(undefined as never);
        if (config.auth.kind === 'userToken') await verifyUserToken(config.auth.userToken);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Wix server credentials (${config.auth.kind}Strategy) cannot authenticate: ${reason}. ` +
                'For appStrategy, move config/.wix.yaml away and run jay-stack-cli setup --interactive ' +
                'to regenerate appId, appSecret, siteId and instanceId (DL #54); or use ' +
                'apiKeyStrategy { apiKey, siteId } (an API key from the Wix API Keys Manager).',
        );
    }
}
