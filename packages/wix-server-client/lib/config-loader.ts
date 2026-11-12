import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ApiKeyConfig {
    apiKey: string;
    siteId: string;
}

/** The headless companion app's instance on one site: its token reaches only that site (DL #54). */
export interface AppConfig {
    appId: string;
    appSecret: string;
    siteId: string;
    /** The app instance on the site; @wix/sdk's AppStrategy cannot authenticate without it. */
    instanceId: string;
}

/**
 * PoC (DL #56): the server calls Wix as a contributor's own Wix user, from their access token. No
 * app secret on the machine; calls get the contributor's permissions. `siteId` scopes an account
 * token to the site (`wix-site-id`).
 */
export interface UserTokenConfig {
    token: string;
    siteId?: string;
}

export interface OAuthConfig {
    clientId: string;
}

export type ServerAuthConfig =
    | { kind: 'apiKey'; apiKey: ApiKeyConfig }
    | { kind: 'app'; app: AppConfig }
    | { kind: 'userToken'; userToken: UserTokenConfig }
    /** No server secret: the server reads public data as a visitor of `oauthStrategy.clientId`. */
    | { kind: 'visitor' };

export interface WixConfig {
    auth: ServerAuthConfig;
    oauth: OAuthConfig;
}

function requireNonEmptyString(value: unknown, label: string): string {
    if (!value || typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Config validation failed: "${label}" must be a non-empty string`);
    }
    return value;
}

function parseServerAuth(config: Record<string, Record<string, string>>): ServerAuthConfig {
    const hasApiKey = !!config.apiKeyStrategy;
    const hasApp = !!config.appStrategy;
    const hasUserToken = !!config.userTokenStrategy;

    if ([hasApiKey, hasApp, hasUserToken].filter(Boolean).length > 1) {
        throw new Error(
            'Config validation failed: provide only one of "apiKeyStrategy", "appStrategy" or "userTokenStrategy"',
        );
    }

    // Without a server secret, server-side reads (catalog, services) use visitor access: a site can then ship
    // with no secret at all (e.g. a static export).
    if (!hasApiKey && !hasApp && !hasUserToken) return { kind: 'visitor' };

    if (hasUserToken) {
        // The token may come from the environment, so it never has to be written to disk
        const strategy = config.userTokenStrategy;
        const token = requireNonEmptyString(
            strategy.token || process.env.WIX_TOKEN,
            'userTokenStrategy.token (or the WIX_TOKEN env)',
        );
        return {
            kind: 'userToken',
            userToken: strategy.siteId ? { token, siteId: String(strategy.siteId) } : { token },
        };
    }

    if (hasApiKey) {
        const strategy = config.apiKeyStrategy;
        return {
            kind: 'apiKey',
            apiKey: {
                apiKey: requireNonEmptyString(strategy.apiKey, 'apiKeyStrategy.apiKey'),
                siteId: requireNonEmptyString(strategy.siteId, 'apiKeyStrategy.siteId'),
            },
        };
    }

    const strategy = config.appStrategy;
    return {
        kind: 'app',
        app: {
            appId: requireNonEmptyString(strategy.appId, 'appStrategy.appId'),
            appSecret: requireNonEmptyString(strategy.appSecret, 'appStrategy.appSecret'),
            siteId: requireNonEmptyString(strategy.siteId, 'appStrategy.siteId'),
            instanceId: requireNonEmptyString(strategy.instanceId, 'appStrategy.instanceId'),
        },
    };
}

export function loadConfig(): WixConfig {
    return loadConfigFrom(path.join(process.cwd(), 'config', '.wix.yaml'));
}

export function loadConfigFrom(configPath: string): WixConfig {
    // Check if the config file exists
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found at: ${configPath}`);
    }

    // Read and parse the YAML file
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents) as any;

    if (!config) {
        throw new Error('Config file is empty or invalid');
    }

    const auth = parseServerAuth(config);

    if (!config.oauthStrategy) {
        throw new Error('Config validation failed: "oauthStrategy" section is required');
    }
    const oauth = config.oauthStrategy;

    if (!oauth.clientId || typeof oauth.clientId !== 'string' || oauth.clientId.trim() === '') {
        throw new Error(
            'Config validation failed: "oauthStrategy.clientId" must be a non-empty string',
        );
    }

    return {
        auth,
        oauth: {
            clientId: oauth.clientId,
        },
    };
}
