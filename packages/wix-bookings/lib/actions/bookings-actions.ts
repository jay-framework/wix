import { makeJayQuery, makeJayAction } from '@jay-framework/fullstack-component';
import { WIX_BOOKINGS_SERVICE } from '../services/wix-bookings-service-marker.js';

export const listServices = makeJayQuery('wixBookings.listServices')
    .withServices(WIX_BOOKINGS_SERVICE)
    .withCaching({ maxAge: 300 })
    .withHandler(async (_input: Record<string, never>, bookings) => {
        const services = await bookings.listServices();
        return { services };
    });

export const listSlots = makeJayQuery('wixBookings.listSlots')
    .withServices(WIX_BOOKINGS_SERVICE)
    .withHandler(
        async (
            input: {
                serviceId: string;
                serviceType: 'APPOINTMENT' | 'CLASS';
                timezone?: string;
                windowDays?: number;
            },
            bookings,
        ) => {
            const slots = await bookings.listSlots(input);
            return { slots };
        },
    );

export const createBooking = makeJayAction('wixBookings.createBooking')
    .withServices(WIX_BOOKINGS_SERVICE)
    .withHandler(
        async (
            input: {
                serviceId: string;
                serviceType: 'APPOINTMENT' | 'CLASS';
                slot: {
                    localStartDate: string;
                    localEndDate: string;
                    scheduleId?: string;
                    eventId?: string;
                };
                formValues: Record<string, string>;
                timezone: string;
                siteOrigin: string;
                paymentPreference?: 'ONLINE' | 'OFFLINE';
            },
            bookings,
        ) => bookings.createBooking(input),
    );
