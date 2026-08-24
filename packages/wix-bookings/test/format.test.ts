// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    formatDurationMinutes,
    formatPrice,
    formatSlotLabel,
    localDateStr,
    mapAppointmentSlot,
    mapClassSlot,
    mapService,
    paymentPreferenceFromService,
} from '../lib/utils/format.js';

describe('mapService', () => {
    it('should map raw Wix service to booking service view', () => {
        const result = mapService({
            _id: 'svc-1',
            name: 'Consultation',
            type: 'APPOINTMENT',
            description: '30-minute call',
            payment: {
                fixed: { price: { currency: 'USD', value: '50.00' } },
            },
            schedule: {
                availabilityConstraints: { sessionDurations: [30] },
            },
            form: { _id: 'form-1' },
        });

        expect(result).toEqual({
            id: 'svc-1',
            name: 'Consultation',
            type: 'APPOINTMENT',
            description: '30-minute call',
            priceLabel: 'USD 50.00',
            durationLabel: '30 min',
            formId: 'form-1',
        });
    });

    it('should label free services without price', () => {
        const result = mapService({ _id: 'svc-2', name: 'Free intro' });
        expect(result.priceLabel).toBe('Free');
    });
});

describe('formatPrice', () => {
    it('should format currency and amount', () => {
        expect(
            formatPrice({
                payment: { fixed: { price: { currency: 'EUR', value: '25.5' } } },
            }),
        ).toBe('EUR 25.50');
    });
});

describe('formatDurationMinutes', () => {
    it('should format session duration', () => {
        expect(
            formatDurationMinutes({
                schedule: { availabilityConstraints: { sessionDurations: [45] } },
            }),
        ).toBe('45 min');
    });

    it('should return empty string when no duration', () => {
        expect(formatDurationMinutes({})).toBe('');
    });
});

describe('mapAppointmentSlot', () => {
    it('should map appointment slot with schedule ID', () => {
        const result = mapAppointmentSlot({
            scheduleId: 'sched-1',
            localStartDate: '2026-08-20T10:00:00',
            localEndDate: '2026-08-20T10:30:00',
        });

        expect(result).toMatchObject({
            id: 'sched-1',
            scheduleId: 'sched-1',
            serviceType: 'APPOINTMENT',
            localStartDate: '2026-08-20T10:00:00',
            localEndDate: '2026-08-20T10:30:00',
        });
        expect(result?.label).toBeTruthy();
    });

    it('should return null when required fields are missing', () => {
        expect(mapAppointmentSlot({ scheduleId: 'sched-1' })).toBeNull();
    });
});

describe('mapClassSlot', () => {
    it('should map class slot with event ID', () => {
        const result = mapClassSlot({
            eventInfo: { eventId: 'event-1' },
            localStartDate: '2026-08-20T14:00:00',
            localEndDate: '2026-08-20T15:00:00',
        });

        expect(result).toMatchObject({
            id: 'event-1',
            eventId: 'event-1',
            serviceType: 'CLASS',
        });
    });
});

describe('formatSlotLabel', () => {
    it('should produce a human-readable label', () => {
        const label = formatSlotLabel('2026-08-20T10:00:00');
        expect(label).toMatch(/Aug/);
        expect(label).toMatch(/20/);
    });
});

describe('localDateStr', () => {
    it('should format date as local ISO-like string', () => {
        const date = new Date(2026, 7, 20, 9, 5, 3);
        expect(localDateStr(date)).toBe('2026-08-20T09:05:03');
    });
});

describe('paymentPreferenceFromService', () => {
    it('should prefer ONLINE when only online is enabled', () => {
        expect(
            paymentPreferenceFromService({
                payment: { options: { online: true, inPerson: false } },
            }),
        ).toBe('ONLINE');
    });

    it('should prefer OFFLINE when only in-person is enabled', () => {
        expect(
            paymentPreferenceFromService({
                payment: { options: { online: false, inPerson: true } },
            }),
        ).toBe('OFFLINE');
    });

    it('should default to ONLINE when both or neither are set', () => {
        expect(paymentPreferenceFromService({})).toBe('ONLINE');
        expect(
            paymentPreferenceFromService({
                payment: { options: { online: true, inPerson: true } },
            }),
        ).toBe('ONLINE');
    });
});
