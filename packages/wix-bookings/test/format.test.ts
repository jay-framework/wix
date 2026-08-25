// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    createSlotId,
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

describe('createSlotId', () => {
    it('should combine resource id and start time into a unique slot id', () => {
        expect(createSlotId('sched-1', '2026-08-20T10:00:00')).toBe(
            'sched-1:2026-08-20T10:00:00',
        );
    });
});

describe('mapAppointmentSlot', () => {
    it('should map appointment slot with composite schedule and start time id', () => {
        const result = mapAppointmentSlot({
            scheduleId: 'sched-1',
            localStartDate: '2026-08-20T10:00:00',
            localEndDate: '2026-08-20T10:30:00',
        });

        expect(result).toMatchObject({
            id: 'sched-1:2026-08-20T10:00:00',
            scheduleId: 'sched-1',
            serviceType: 'APPOINTMENT',
            localStartDate: '2026-08-20T10:00:00',
            localEndDate: '2026-08-20T10:30:00',
        });
        expect(result?.label).toBeTruthy();
    });

    it('should assign unique ids when multiple slots share the same schedule', () => {
        const morning = mapAppointmentSlot({
            scheduleId: 'sched-1',
            localStartDate: '2026-08-20T10:00:00',
            localEndDate: '2026-08-20T10:30:00',
        });
        const afternoon = mapAppointmentSlot({
            scheduleId: 'sched-1',
            localStartDate: '2026-08-20T14:00:00',
            localEndDate: '2026-08-20T14:30:00',
        });

        expect(morning?.id).not.toBe(afternoon?.id);
        expect(morning?.id).toBe('sched-1:2026-08-20T10:00:00');
        expect(afternoon?.id).toBe('sched-1:2026-08-20T14:00:00');
    });

    it('should return null when required fields are missing', () => {
        expect(mapAppointmentSlot({ scheduleId: 'sched-1' })).toBeNull();
    });
});

describe('mapClassSlot', () => {
    it('should map class slot with composite event and start time id', () => {
        const result = mapClassSlot({
            eventInfo: { eventId: 'event-1' },
            localStartDate: '2026-08-20T14:00:00',
            localEndDate: '2026-08-20T15:00:00',
        });

        expect(result).toMatchObject({
            id: 'event-1:2026-08-20T14:00:00',
            eventId: 'event-1',
            serviceType: 'CLASS',
        });
    });

    it('should assign unique ids for recurring classes with the same event id', () => {
        const firstSession = mapClassSlot({
            eventInfo: { eventId: 'event-1' },
            localStartDate: '2026-08-20T14:00:00',
            localEndDate: '2026-08-20T15:00:00',
        });
        const secondSession = mapClassSlot({
            eventInfo: { eventId: 'event-1' },
            localStartDate: '2026-08-27T14:00:00',
            localEndDate: '2026-08-27T15:00:00',
        });

        expect(firstSession?.id).not.toBe(secondSession?.id);
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
