import fs from 'node:fs';
import path from 'node:path';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';
import { getService, hasService } from '@jay-framework/stack-server-runtime';
import { WIX_FORMS_SERVICE } from '@jay-framework/wix-forms';
import { serverClientSetupBlocker, WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { loadWixBookingsConfig } from './config-loader.js';
import { discoverStaffResourceTypeId } from './wix-apis/discover-staff-resource-type.js';

const CONFIG_FILE = '.wix-bookings.yaml';

const CONFIG_TEMPLATE = `# Wix Bookings Configuration
#
# bookingAppId — the app that owns the bookings services (empty = the Wix Bookings app;
# each service in POST /bookings/v2/services/query carries it as appId)
bookingAppId: ""

# staffResourceTypeId — resource type of the site's staff (site-specific). Setup fills it:
# the typeId of a staff member's resource in POST /bookings/v2/resources/query
staffResourceTypeId: ""

slotWindowDays: 14
postCheckoutUrl: "/book"
`;

export async function setupWixBookings(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    const blocker = serverClientSetupBlocker(ctx.initError);
    if (blocker) return blocker;

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
    let filled = '';
    if (!config.staffResourceTypeId) {
        const staffResourceTypeId = await discoverStaffResourceTypeId(
            getService(WIX_CLIENT_SERVICE),
        );
        if (!staffResourceTypeId) {
            return {
                status: 'needs-config',
                configCreated,
                message: `Set staffResourceTypeId in config/${CONFIG_FILE}: Wix returned no staff resource. Add a staff member in the Bookings dashboard and run setup again, or copy the typeId of a staff resource from POST /bookings/v2/resources/query.`,
            };
        }
        writeConfigValue(configPath, 'staffResourceTypeId', staffResourceTypeId);
        filled = `, staffResourceTypeId filled from Wix: ${staffResourceTypeId}`;
    }

    return {
        status: 'configured',
        configCreated,
        message: `Wix Bookings configured (app: ${config.bookingAppId}${filled})`,
    };
}

/** Sets a top-level `key: "value"` line in the YAML config, keeping its comments. */
function writeConfigValue(configPath: string, key: string, value: string): void {
    const text = fs.readFileSync(configPath, 'utf-8');
    const line = `${key}: ${JSON.stringify(value)}`;
    const keyLine = new RegExp(`^${key}:.*$`, 'm');
    const updated = keyLine.test(text)
        ? text.replace(keyLine, line)
        : `${text.trimEnd()}\n${line}\n`;
    fs.writeFileSync(configPath, updated, 'utf-8');
}

export const setup = setupWixBookings;
