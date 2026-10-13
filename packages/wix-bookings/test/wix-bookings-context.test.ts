// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

const calls: { path: string; body?: any }[] = [];
const responses: Record<string, unknown> = {};
vi.mock('@jay-framework/wix-server-client/client', () => ({
    WIX_CLIENT_CONTEXT: Symbol.for('jay:wix:cc'),
    WixApiError: class extends Error {},
    wixFetch: vi.fn(async (_client: unknown, path: string, options: { body?: any } = {}) => {
        calls.push({ path, body: options.body });
        return responses[path.split('?')[0]] ?? {};
    }),
}));

import { canBookOnline, createWixBookingsContext } from '../lib/contexts/wix-bookings-context';
import { WIX_BOOKINGS_APP_ID, loadWixBookingsConfig } from '../lib/config-loader';

const ALL_OFF = { groups: false, appointments: false, courses: false, payments: false };

describe('canBookOnline', () => {
    it('stops a class or appointment the site plan does not include, at every step', () => {
        for (const step of ['serviceList', 'calendar', 'form'] as const) {
            expect(canBookOnline(ALL_OFF, 'CLASS', step)).toBe(false);
            expect(canBookOnline(ALL_OFF, 'APPOINTMENT', step)).toBe(false);
        }
        expect(canBookOnline({ ...ALL_OFF, groups: true }, 'CLASS', 'calendar')).toBe(true);
        expect(canBookOnline({ ...ALL_OFF, appointments: true }, 'APPOINTMENT', 'form')).toBe(true);
    });

    it('lets a course through the service list and stops it at the form, as Wix does', () => {
        expect(canBookOnline(ALL_OFF, 'COURSE', 'serviceList')).toBe(true);
        expect(canBookOnline(ALL_OFF, 'COURSE', 'form')).toBe(false);
        expect(canBookOnline({ ...ALL_OFF, courses: true }, 'COURSE', 'form')).toBe(true);
    });
});

describe('bookings context', () => {
    const config = { bookingAppId: WIX_BOOKINGS_APP_ID, staffResourceTypeId: '', slotWindowDays: 14, postCheckoutUrl: '/' };

    it("reads the site plan's booking features once", async () => {
        calls.length = 0;
        responses['/_api/bookings-settings/v2/settings'] = {
            bookingsSettings: { features: { bookingsGroups: { enabled: true }, bookingsAppointments: { enabled: false }, bookingsCourses: {} } },
        };
        const context = createWixBookingsContext({} as never, config);
        expect(await context.features()).toEqual({ groups: true, appointments: false, courses: false, payments: false });
        await context.features();
        expect(calls.map((c) => c.path)).toEqual(['/_api/bookings-settings/v2/settings?fields=FEATURES']);
    });

    it('finds a service by its URL slug and queries its slots like the calendar does', async () => {
        calls.length = 0;
        responses['/bookings/v2/services/query'] = { services: [{ id: 's1', type: 'CLASS' }] };
        responses['/_api/service-availability/v2/time-slots/event'] = { timeSlots: [{ localStartDate: '2026-10-14T09:00:00', bookable: true }] };
        const context = createWixBookingsContext({} as never, config);
        expect(await context.serviceBySlug('east-basic')).toEqual({ id: 's1', type: 'CLASS' });
        expect(calls[0].body.query.filter).toEqual({ 'supportedSlugs.name': 'east-basic', hidden: false });
        const slots = await context.timeSlots({
            serviceIds: ['s1'], timeZone: 'Asia/Singapore', fromLocalDate: '2026-10-14T00:00:00', toLocalDate: '2026-10-31T23:59:59', maxSlotsPerDay: 1,
        });
        expect(slots).toHaveLength(1);
        expect(calls[1].body).toEqual({
            serviceIds: ['s1'], timeZone: 'Asia/Singapore', fromLocalDate: '2026-10-14T00:00:00', toLocalDate: '2026-10-31T23:59:59',
            includeNonBookable: true, maxSlotsPerDay: 1, eventFilter: {}, cursorPaging: { limit: 1000 },
        });
    });

    it('defaults the bookings app id to the Wix Bookings app', () => {
        expect(loadWixBookingsConfig('/nonexistent').bookingAppId).toBe('13d21c63-b5ec-5912-8397-c3a5ddb27a97');
    });
});
