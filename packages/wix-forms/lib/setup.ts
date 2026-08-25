import fs from 'node:fs';
import path from 'node:path';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';
import { loadWixFormsConfig } from './config-loader.js';

const CONFIG_FILE = '.wix-forms.yaml';

const CONFIG_TEMPLATE = `# Wix Forms Configuration
#
# Default form when no formId prop is passed (Wix Dashboard → Forms)
defaultFormId: ""
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
    if (!config.defaultFormId) {
        return {
            status: 'needs-config',
            configCreated,
            message: `Set defaultFormId in config/${CONFIG_FILE}`,
        };
    }

    return {
        status: 'configured',
        configCreated,
        message: `Wix Forms configured (default form: ${config.defaultFormId})`,
    };
}

export const setup = setupWixForms;
