import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type {
    PluginAgentKitContext,
    PluginAgentKitResult,
} from '@jay-framework/stack-server-runtime';
import { getService, hasService } from '@jay-framework/stack-server-runtime';
import { canonicalFormId, WIX_FORMS_SERVICE, type WixFormsService } from '@jay-framework/wix-forms';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { loadWixBookingsConfig } from './config-loader.js';
import {
    buildServicesReference,
    buildSiteReference,
    serviceId,
    type ParticipantAddressFlags,
} from './generators/bookings-references.js';
import { participantFormId } from './utils/format.js';
import type { RawBookingService } from './wix-apis/query-services.js';
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

    const forms = hasService(WIX_FORMS_SERVICE) ? getService(WIX_FORMS_SERVICE) : undefined;
    const servicesRef = buildServicesReference(
        services,
        await participantAddressFlags(services, forms),
    );
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

/**
 * Whether each visible service's participant form has a visible address (DL #52 §6). Reads the raw
 * form only (no templates). A failed read omits that service's flag and logs why (review m6).
 */
export async function participantAddressFlags(
    services: RawBookingService[],
    forms: WixFormsService | undefined,
): Promise<ParticipantAddressFlags> {
    const flags = new Map<string, boolean>();
    if (!forms) return flags;
    for (const service of services.filter((entry) => !entry.hidden)) {
        const id = serviceId(service);
        const formId = canonicalFormId(participantFormId(service.form));
        if (!id || !formId) continue;
        try {
            const rawForm = await forms.getRawForm(formId);
            flags.set(id, hasVisibleAddress(rawForm.formFields ?? []));
        } catch (error) {
            console.warn(
                `[wix-bookings] agent-kit: could not read the participant form of service "${service.name ?? id}"; participantFormHasAddress is left out (${error instanceof Error ? error.message : String(error)}).`,
            );
        }
    }
    return flags;
}

function hasVisibleAddress(
    fields: Array<{ hidden?: boolean; inputOptions?: { inputType?: string } }>,
): boolean {
    return fields.some((field) => !field.hidden && field.inputOptions?.inputType === 'ADDRESS');
}
