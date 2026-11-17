// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeForms = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('@jay-framework/stack-server-runtime', () => ({
    getService: vi.fn((marker: unknown) => (marker === 'forms' ? fakeForms.current : {})),
    hasService: vi.fn((marker: unknown) => marker === 'forms' && fakeForms.current !== undefined),
}));
vi.mock('@jay-framework/wix-forms', () => ({
    WIX_FORMS_SERVICE: 'forms',
    canonicalFormId: (id: string) => (/^[0-9a-f-]{36}$/.test(id ?? '') ? id : undefined),
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

/**
 * DL #52 §6 / B8: services.yaml says which services ask for an address, from the raw form only.
 * Review round 3, m6: a form that cannot be read leaves the flag out (the validator then warns).
 */
describe('participantFormHasAddress in services.yaml (DL #52)', () => {
    const ADDRESS_FORM = '11111111-1111-1111-1111-111111111111';
    const PLAIN_FORM = '22222222-2222-2222-2222-222222222222';
    const BROKEN_FORM = '33333333-3333-3333-3333-333333333333';

    beforeEach(() => {
        vi.clearAllMocks();
        mockQueryStaff.mockResolvedValue([]);
        mockDiscoverType.mockResolvedValue('type');
        fakeForms.current = {
            getRawForm: vi.fn(async (formId: string) => {
                if (formId === BROKEN_FORM) throw new Error('Wix API 503');
                const inputType = formId === ADDRESS_FORM ? 'ADDRESS' : 'STRING';
                return { formFields: [{ inputOptions: { inputType } }] };
            }),
        };
    });

    it('writes true, false, and no flag when the form cannot be read', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockQueryServices.mockResolvedValue([
            { _id: 'svc-a', name: 'With address', hidden: false, form: { id: ADDRESS_FORM } },
            { _id: 'svc-b', name: 'Plain', hidden: false, form: { id: PLAIN_FORM } },
            { _id: 'svc-c', name: 'Broken', hidden: false, form: { id: BROKEN_FORM } },
        ] as never);
        const context = ctx();
        await generateWixBookingsAgentKit(context as never);
        const written = yaml.load(
            fs.readFileSync(path.join(context.referencesDir, 'services.yaml'), 'utf8'),
        ) as { services: Array<Record<string, unknown>> };
        expect(written.services.map((service) => service.participantFormHasAddress)).toEqual([
            true,
            false,
            undefined,
        ]);
        expect('participantFormHasAddress' in written.services[2]).toBe(false);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('could not read the participant form of service "Broken"'),
        );
        fakeForms.current = undefined;
    });
});
