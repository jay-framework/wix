import fs from 'node:fs';
import path from 'node:path';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';
import { loadWixBookingsConfig } from './config-loader.js';

const CONFIG_FILE = '.wix-bookings.yaml';
const WIX_FORMS_PACKAGE = '@jay-framework/wix-forms';
const WIX_FORMS_CONFIG_FILE = '.wix-forms.yaml';

const CONFIG_TEMPLATE = `# Wix Bookings Configuration
#
# bookingAppId — Wix Bookings app ID on your site
bookingAppId: ""

# staffResourceTypeId — resource type for staff selection (site-specific)
staffResourceTypeId: ""

slotWindowDays: 14
postCheckoutUrl: "/book"
`;

function projectIncludesWixForms(projectRoot: string): boolean {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        return false;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
    };

    return [
        packageJson.dependencies,
        packageJson.devDependencies,
        packageJson.optionalDependencies,
    ].some((section) => section !== undefined && WIX_FORMS_PACKAGE in section);
}

function resolveWixFormsSetupIssue(ctx: PluginSetupContext): string | undefined {
    if (!projectIncludesWixForms(ctx.projectRoot)) {
        return (
            'wix-bookings requires @jay-framework/wix-forms in package.json. ' +
            'Add the dependency and run: jay-stack setup wix-forms'
        );
    }

    const formsConfigPath = path.join(ctx.configDir, WIX_FORMS_CONFIG_FILE);
    if (!fs.existsSync(formsConfigPath)) {
        return (
            'wix-bookings requires wix-forms configuration at config/.wix-forms.yaml. ' +
            'Run: jay-stack setup wix-forms'
        );
    }

    return undefined;
}

export async function setupWixBookings(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    const formsSetupIssue = resolveWixFormsSetupIssue(ctx);
    if (formsSetupIssue) {
        return {
            status: 'error',
            message: formsSetupIssue,
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

    const config = loadWixBookingsConfig(ctx.projectRoot);
    const missing: string[] = [];
    if (!config.bookingAppId) {
        missing.push('bookingAppId');
    }
    if (!config.staffResourceTypeId) {
        missing.push('staffResourceTypeId');
    }

    if (missing.length) {
        return {
            status: 'needs-config',
            configCreated,
            message: `Set ${missing.join(', ')} in config/${CONFIG_FILE}`,
        };
    }

    return {
        status: 'configured',
        configCreated,
        message: `Wix Bookings configured (app: ${config.bookingAppId})`,
    };
}

export const setup = setupWixBookings;
