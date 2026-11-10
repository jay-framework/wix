import { describe, expect, it } from 'vitest';
import {
    buildServicesReference,
    buildSiteReference,
} from '../lib/generators/bookings-references.js';

describe('buildServicesReference', () => {
    it('should index visible services with dashboard paths', () => {
        const reference = buildServicesReference([
            {
                _id: 'svc-1',
                name: 'Massage',
                type: 'APPOINTMENT',
                hidden: false,
                form: { id: 'form-1' },
            },
            { _id: 'svc-hidden', name: 'Hidden', hidden: true },
            { _id: 'svc-2', name: 'Intro', form: { id: '00000000-0000-0000-0000-000000000000' } },
        ]);

        expect(reference.totalServices).toBe(3);
        expect(reference.visibleServices).toBe(2);
        expect(reference.services[1]?.formId).toBe('');
        expect(reference.services[0]).toMatchObject({
            serviceId: 'svc-1',
            name: 'Massage',
            formId: 'form-1',
            dashboardPath: 'bookings/services/form/svc-1',
        });
    });
});

describe('buildSiteReference', () => {
    it('should include staffResourceTypeId and staff members', () => {
        const reference = buildSiteReference({
            staffResourceTypeId: 'type-staff',
            staffMembers: [{ id: 'staff-1', resourceId: 'res-1' }],
        });
        expect(reference.staffResourceTypeId).toBe('type-staff');
        expect(reference.staffMembers).toHaveLength(1);
    });
});
