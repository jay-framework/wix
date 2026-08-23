import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ApiKeyConfig {
    apiKey: string;
    siteId: string;
}

export interface AppConfig {
    appId: string;
    appSecret: string;
}

export interface OAuthConfig {
    clientId: string;
}

export type ServerAuthConfig =
    | { kind: 'apiKey'; apiKey: ApiKeyConfig }
    | { kind: 'app'; app: AppConfig };

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

    if (hasApiKey && hasApp) {
        throw new Error(
            'Config validation failed: provide either "apiKeyStrategy" or "appStrategy", not both',
        );
    }

    if (!hasApiKey && !hasApp) {
        throw new Error(
            'Config validation failed: either "apiKeyStrategy" or "appStrategy" section is required',
        );
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
        },
    };
}

export function loadConfig(): WixConfig {
    // Resolve the config path relative to the process execution path
    const configPath = path.join(process.cwd(), 'config', '.wix.yaml');

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
