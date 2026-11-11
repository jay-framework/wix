// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/stack-server-runtime', () => ({
    getService: vi.fn(() => ({})),
}));
vi.mock('@jay-framework/wix-server-client', () => ({ WIX_CLIENT_SERVICE: 'client' }));
vi.mock('@jay-framework/wix-server-client/client', () => ({ wixFetch: vi.fn() }));
vi.mock('../lib/wix-apis/query-services.js', () => ({
    queryBookingServices: vi.fn(),
}));
vi.mock('../lib/wix-apis/query-staff-members.js', () => ({
    queryStaffMembers: vi.fn(),
}));
vi.mock('../lib/wix-apis/discover-staff-resource-type.js', () => ({
    discoverStaffResourceTypeId: vi.fn(),
}));

import { queryBookingServices } from '../lib/wix-apis/query-services.js';
import { queryStaffMembers } from '../lib/wix-apis/query-staff-members.js';
import { discoverStaffResourceTypeId } from '../lib/wix-apis/discover-staff-resource-type.js';
import { generateWixBookingsAgentKit } from '../lib/generate-agent-kit.js';

const mockQueryServices = vi.mocked(queryBookingServices);
const mockQueryStaff = vi.mocked(queryStaffMembers);
const mockDiscoverType = vi.mocked(discoverStaffResourceTypeId);

function ctx() {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wix-bookings-agent-kit-'));
    const configDir = path.join(projectRoot, 'config');
    fs.mkdirSync(configDir);
    fs.writeFileSync(
        path.join(configDir, '.wix-bookings.yaml'),
        'staffResourceTypeId: "type-from-config"\n',
    );
    return {
        projectRoot,
        referencesDir: path.join(projectRoot, 'agent-kit/references/wix-bookings'),
        pluginName: 'wix-bookings',
        force: false,
        services: {},
    };
}

describe('generateWixBookingsAgentKit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should write services.yaml and site.yaml under agent-kit references', async () => {
        mockQueryServices.mockResolvedValue([
            { _id: 'svc-1', name: 'Yoga', type: 'CLASS', hidden: false },
        ]);
        mockQueryStaff.mockResolvedValue([{ id: 'st-1', resourceId: 'res-1' }]);
        mockDiscoverType.mockResolvedValue('type-discovered');

        const project = ctx();
        const result = await generateWixBookingsAgentKit(project);

        expect(result.agentKitCreated).toEqual([
            'agent-kit/references/wix-bookings/services.yaml',
            'agent-kit/references/wix-bookings/site.yaml',
        ]);

        const services = yaml.load(
            fs.readFileSync(path.join(project.referencesDir, 'services.yaml'), 'utf-8'),
        ) as { services: { serviceId: string }[] };
        expect(services.services[0]?.serviceId).toBe('svc-1');

        const site = yaml.load(
            fs.readFileSync(path.join(project.referencesDir, 'site.yaml'), 'utf-8'),
        ) as { staffResourceTypeId: string; staffResourceTypeIdFromConfig: string };
        expect(site.staffResourceTypeIdFromConfig).toBe('type-from-config');
        expect(site.staffResourceTypeId).toBe('type-from-config');
    });
});
