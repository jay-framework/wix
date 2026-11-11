import { ApiKeyStrategy, AppStrategy, OAuthStrategy } from '@wix/sdk';
import type { WixConfig } from './config-loader';

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
