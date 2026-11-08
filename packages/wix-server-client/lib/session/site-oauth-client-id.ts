import { getClientInitDataForKey } from '@jay-framework/stack-server-runtime';

/** This site's OAuth client id, as returned by this plugin's server init (DL#42 Q3). */
export function siteOAuthClientId(): string {
    const clientId = getClientInitDataForKey('wix-server-client').oauthClientId;
    if (typeof clientId !== 'string' || !clientId) {
        throw new Error(
            'wix-server-client: no OAuth client id. The plugin server init has not run; check config/.wix.yaml oauthStrategy.clientId.',
        );
    }
    return clientId;
}
