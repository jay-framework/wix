/**
 * Setup handler for wix-server-client plugin (Design Log #87).
 *
 * Creates config/.wix.yaml template if missing, validates credentials.
 * No reference data (credentials-only plugin).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';

const CONFIG_FILE_NAME = '.wix.yaml';

const CONFIG_TEMPLATE = `# Wix API Configuration
# 
# This file contains credentials for connecting to your Wix site.
# Get these values from your Wix dashboard:
#   - API Key: https://dev.wix.com/docs/rest/articles/getting-started/api-keys
#   - Site ID: Found in your Wix dashboard URL or site settings
#   - OAuth Client ID: Create an OAuth app in Wix Developers dashboard
#
# IMPORTANT: This file contains secrets. Add config/.wix.yaml to .gitignore.

# Server-side authentication (required)
apiKeyStrategy:
  apiKey: "<your-api-key>"
  siteId: "<your-site-id>"

# Client-side authentication (required for interactive features)
oauthStrategy:
  clientId: "<your-oauth-client-id>"
`;

export async function setupWixServerClient(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    const configPath = path.join(ctx.configDir, CONFIG_FILE_NAME);

    // Phase 1: Check if config exists
    if (!fs.existsSync(configPath)) {
        // Create config directory if needed
        if (!fs.existsSync(ctx.configDir)) {
            fs.mkdirSync(ctx.configDir, { recursive: true });
        }

        fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');

        return {
            status: 'needs-config',
            configCreated: [`config/${CONFIG_FILE_NAME}`],
            message: 'Fill in your Wix API credentials and re-run: jay-stack setup wix-server-client',
        };
    }

    // Phase 2: Config exists — check if it has placeholder values
    try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = yaml.load(configContent) as any;

        if (!config) {
            return {
                status: 'error',
                message: `Config file is empty: config/${CONFIG_FILE_NAME}`,
            };
        }

        // Check for placeholder values
        const apiKey = config.apiKeyStrategy?.apiKey || '';
        const siteId = config.apiKeyStrategy?.siteId || '';
        const clientId = config.oauthStrategy?.clientId || '';

        const hasPlaceholders =
            apiKey.startsWith('<') || siteId.startsWith('<') || clientId.startsWith('<');
        const isEmpty = !apiKey || !siteId;

        if (hasPlaceholders || isEmpty) {
            return {
                status: 'needs-config',
                message: `Config has placeholder values. Fill in credentials in config/${CONFIG_FILE_NAME}`,
            };
        }

        // If init failed despite having config, report the error
        if (ctx.initError) {
            return {
                status: 'error',
                message: `Credentials invalid or connection failed: ${ctx.initError.message}`,
            };
        }

        // Services initialized successfully
        return {
            status: 'configured',
            message: `Wix client connected (site: ${siteId.substring(0, 8)}...)`,
        };
    } catch (error: any) {
        return {
            status: 'error',
            message: `Failed to read config: ${error.message}`,
        };
    }
}
