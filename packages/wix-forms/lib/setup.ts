import fs from 'node:fs';
import path from 'node:path';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';
import { loadWixFormsConfig } from './config-loader.js';

const CONFIG_FILE = '.wix-forms.yaml';

const CONFIG_TEMPLATE = `# Wix Forms Configuration
#
# Default contact form on the home page (Wix Dashboard → Forms)
defaultContactFormId: ""
`;

export async function setupWixForms(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    const configCreated: string[] = [];
    const configPath = path.join(ctx.configDir, CONFIG_FILE);

    if (!fs.existsSync(configPath)) {
        if (!fs.existsSync(ctx.configDir)) {
            fs.mkdirSync(ctx.configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
        configCreated.push(`config/${CONFIG_FILE}`);
    }

    const config = loadWixFormsConfig(ctx.projectRoot);
    if (!config.defaultContactFormId) {
        return {
            status: 'needs-config',
            configCreated,
            message: `Set defaultContactFormId in config/${CONFIG_FILE}`,
        };
    }

    return {
        status: 'configured',
        configCreated,
        message: `Wix Forms configured (default form: ${config.defaultContactFormId})`,
    };
}

export const setup = setupWixForms;
