import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type {
    PluginAgentKitContext,
    PluginAgentKitResult,
} from '@jay-framework/stack-server-runtime';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { loadWixBookingsConfig } from './config-loader.js';
import { buildServicesReference, buildSiteReference } from './generators/bookings-references.js';
import { discoverStaffResourceTypeId } from './wix-apis/discover-staff-resource-type.js';
import { queryBookingServices } from './wix-apis/query-services.js';
import { queryStaffMembers } from './wix-apis/query-staff-members.js';

export async function generateWixBookingsAgentKit(
    ctx: PluginAgentKitContext,
): Promise<PluginAgentKitResult> {
    if (ctx.initError) {
        throw new Error(`init failed: ${ctx.initError.message}`);
    }

    const client = getService(WIX_CLIENT_SERVICE);
    const config = loadWixBookingsConfig(ctx.projectRoot);

    const [services, staffMembers, discoveredStaffResourceTypeId] = await Promise.all([
        queryBookingServices(client, config.bookingAppId),
        queryStaffMembers(client),
        discoverStaffResourceTypeId(client),
    ]);

    const servicesRef = buildServicesReference(services);
    const siteRef = buildSiteReference({
        staffResourceTypeId: config.staffResourceTypeId || discoveredStaffResourceTypeId || '',
        staffMembers,
    });

    fs.mkdirSync(ctx.referencesDir, { recursive: true });

    const servicesPath = path.join(ctx.referencesDir, 'services.yaml');
    const sitePath = path.join(ctx.referencesDir, 'site.yaml');

    const yamlOpts = { indent: 2, lineWidth: 120, noRefs: true } as const;
    fs.writeFileSync(
        servicesPath,
        yaml.dump({ _generated: new Date().toISOString(), ...servicesRef }, yamlOpts),
        'utf-8',
    );
    fs.writeFileSync(
        sitePath,
        yaml.dump(
            {
                _generated: new Date().toISOString(),
                staffResourceTypeIdFromConfig: config.staffResourceTypeId,
                staffResourceTypeIdDiscovered: discoveredStaffResourceTypeId ?? '',
                ...siteRef,
            },
            yamlOpts,
        ),
        'utf-8',
    );

    const agentKitCreated = [
        `agent-kit/references/${ctx.pluginName}/services.yaml`,
        `agent-kit/references/${ctx.pluginName}/site.yaml`,
    ];

    const siteNote = siteRef.staffResourceTypeId
        ? ''
        : ' (staffResourceTypeId missing — run jay-stack setup wix-bookings)';

    return {
        agentKitCreated,
        message: `${servicesRef.visibleServices} services indexed${siteNote}`,
    };
}
