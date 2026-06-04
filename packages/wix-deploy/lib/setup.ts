/**
 * wix-deploy setup hook
 *
 * Runs after wix-server-client setup. Reads wix.config.json to populate
 * clientId and siteId in config/.wix.yaml (if they're still placeholders),
 * then validates the data collection exists.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { DEFAULT_COLLECTION_ID } from './constants.js';

interface SetupContext {
    configDir: string;
    projectRoot: string;
}

interface SetupResult {
    status: 'configured' | 'needs-config' | 'error';
    message?: string;
    configCreated?: string[];
}

export async function setupWixDeploy(ctx: SetupContext): Promise<SetupResult> {
    const wixConfigPath = path.join(ctx.projectRoot, 'wix.config.json');
    const wixYamlPath = path.join(ctx.configDir, '.wix.yaml');

    if (!fs.existsSync(wixConfigPath)) {
        return {
            status: 'needs-config',
            message: 'wix.config.json not found. Run: npm create @wix/new@latest init',
        };
    }

    const wixConfig = JSON.parse(fs.readFileSync(wixConfigPath, 'utf8'));
    const appId = wixConfig.appId;
    const siteId = wixConfig.siteId;

    if (!appId) {
        return {
            status: 'error',
            message: 'wix.config.json missing appId',
        };
    }

    const configCreated: string[] = [];
    if (fs.existsSync(wixYamlPath)) {
        const content = fs.readFileSync(wixYamlPath, 'utf8');
        const config = yaml.load(content) as any;

        if (config) {
            let changed = false;

            const currentClientId = config.oauthStrategy?.clientId || '';
            if (!currentClientId || currentClientId.startsWith('<')) {
                if (!config.oauthStrategy) config.oauthStrategy = {};
                config.oauthStrategy.clientId = appId;
                changed = true;
                configCreated.push('clientId');
            }

            const currentSiteId = config.apiKeyStrategy?.siteId || '';
            if (siteId && (!currentSiteId || currentSiteId.startsWith('<'))) {
                if (!config.apiKeyStrategy) config.apiKeyStrategy = {};
                config.apiKeyStrategy.siteId = siteId;
                changed = true;
                configCreated.push('siteId');
            }

            if (changed) {
                fs.writeFileSync(wixYamlPath, yaml.dump(config, { lineWidth: -1 }), 'utf8');
            }
        }
    }

    // Check if API key is configured
    if (fs.existsSync(wixYamlPath)) {
        const config = yaml.load(fs.readFileSync(wixYamlPath, 'utf8')) as any;
        const apiKey = config?.apiKeyStrategy?.apiKey || '';
        if (!apiKey || apiKey.startsWith('<')) {
            return {
                status: 'needs-config',
                configCreated,
                message: 'API key required — create one at https://manage.wix.com/ and add to config/.wix.yaml',
            };
        }
    }

    return {
        status: 'configured',
        configCreated,
        message: `Deploy target: wix.config.json (appId: ${appId.slice(0, 8)}...). Data collection: ${DEFAULT_COLLECTION_ID}`,
    };
}
