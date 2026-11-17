import { makeJayQuery, makeJayAction, ActionError } from '@jay-framework/fullstack-component';
import { WIX_FORMS_SERVICE } from '@jay-framework/wix-forms';
import { WIX_BOOKINGS_SERVICE } from '../services/wix-bookings-service-marker.js';
import type { CreateBookingInput } from '../types.js';

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

/**
 * The service's participant form from Get Form (DL #51 §3). The form id comes only from the
 * service, so a page cannot point it at another form; the result is what Wix's own form shows.
 */
export const getParticipantForm = makeJayQuery('wixBookings.getParticipantForm')
    .withServices(WIX_BOOKINGS_SERVICE, WIX_FORMS_SERVICE)
    .withHandler(async ({ serviceId }: { serviceId: string }, bookings, forms) => {
        // The id goes into a query filter: a non-string could widen it (DL #51 Q15). A 4xx, not a 500.
        if (typeof serviceId !== 'string' || !serviceId) {
            throw new ActionError('INVALID_INPUT', 'Service ID is missing.');
        }
        return bookings.getParticipantForm(serviceId, forms);
    });

export const createBooking = makeJayAction('wixBookings.createBooking')
    .withServices(WIX_BOOKINGS_SERVICE, WIX_FORMS_SERVICE)
    .withHandler(async (input: CreateBookingInput, bookings, forms) =>
        bookings.createBooking(input, forms),
    );
