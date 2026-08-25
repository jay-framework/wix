import fs from 'node:fs';
import path from 'node:path';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';
import { hasService } from '@jay-framework/stack-server-runtime';
import { WIX_FORMS_SERVICE } from '@jay-framework/wix-forms';
import { loadWixBookingsConfig } from './config-loader.js';

const CONFIG_FILE = '.wix-bookings.yaml';

const CONFIG_TEMPLATE = `# Wix Bookings Configuration
#
# bookingAppId — Wix Bookings app ID on your site
bookingAppId: ""

# staffResourceTypeId — resource type for staff selection (site-specific)
staffResourceTypeId: ""

slotWindowDays: 14
postCheckoutUrl: "/book"
`;

export async function setupWixBookings(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    if (!hasService(WIX_FORMS_SERVICE)) {
        return {
            status: 'error',
            message:
                'wix-bookings requires the wix-forms plugin. Add wix-forms to your project plugins and run setup before wix-bookings.',
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
