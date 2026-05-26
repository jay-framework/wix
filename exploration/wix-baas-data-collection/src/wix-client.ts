import { createClient, ApiKeyStrategy } from '@wix/sdk';
import { items } from '@wix/data';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

interface WixConfig {
    apiKey: string;
    siteId: string;
}

function loadConfig(): WixConfig {
    const configPath = path.join(process.cwd(), 'config', '.wix.yaml');
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config not found: ${configPath}\nCopy config/.wix.yaml.example and fill in your credentials.`);
    }
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as any;
    return {
        apiKey: raw.apiKeyStrategy.apiKey,
        siteId: raw.apiKeyStrategy.siteId,
    };
}

export function createWixDataClient() {
    const config = loadConfig();
    const client = createClient({
        auth: ApiKeyStrategy({
            apiKey: config.apiKey,
            siteId: config.siteId,
        }),
        modules: { items },
    });
    return client;
}

export const COLLECTION_ID = 'jay-backend-files';
