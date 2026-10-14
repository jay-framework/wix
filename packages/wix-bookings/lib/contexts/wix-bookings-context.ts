import { createJayContext, registerGlobalContext, useGlobalContext } from '@jay-framework/runtime';
import type { WixClient } from '@wix/sdk';
import { WIX_CLIENT_CONTEXT, WixApiError, wixFetch, type WixClientContext } from '@jay-framework/wix-server-client/client';
import type { WixBookingsConfig } from '../config-loader.js';
import type { BookingServiceType } from '../types.js';
import { getBookingServiceById, type RawBookingService } from '../wix-apis/query-services.js';
import { createWixBookingsService } from '../services/create-wix-bookings-service.js';
import type { WixBookingsService } from '../services/wix-bookings-service-marker.js';

/**
 * Bookings in the browser, with the visitor's (or member's) own Wix client: for sites served without a Jay
 * server (a static export), where the server actions cannot run. Visitor tokens may query services and
 * availability and create bookings and checkouts, as Wix's own booking widgets do.
 */

/** Which booking features the site's plan includes (`bookings-settings` FEATURES). */
export interface BookingFeatures {
    /** CLASS services */
    groups: boolean;
    /** APPOINTMENT services */
    appointments: boolean;
    /** COURSE services */
    courses: boolean;
    payments: boolean;
}

export type BookingStep = 'serviceList' | 'calendar' | 'form';

/**
 * Whether Wix lets a visitor go on with a service at a booking step, as its widgets decide: a service type the
 * site's plan does not include stops the visitor ("not yet available for online bookings"). The service list
 * and service page let courses through (they start at the form); the form checks every type.
 */
export function canBookOnline(features: BookingFeatures, type: BookingServiceType | 'COURSE', step: BookingStep): boolean {
    if (type === 'COURSE') return step !== 'form' || features.courses;
    return type === 'CLASS' ? features.groups : features.appointments;
}

/** One time slot as `service-availability` returns it (the fields Wix's calendar uses). */
export interface TimeSlot {
    serviceId?: string;
    localStartDate?: string;
    localEndDate?: string;
    bookable?: boolean;
    totalCapacity?: number;
    remainingCapacity?: number;
    bookableCapacity?: number;
    eventInfo?: { eventId?: string };
    location?: { id?: string; name?: string; formattedAddress?: string; locationType?: string };
    availableResources?: { resourceTypeId?: string; resources?: { id?: string; name?: string }[] }[];
    bookingPolicyViolations?: { tooEarlyToBook?: boolean; tooLateToBook?: boolean; bookOnlineDisabled?: boolean };
}

export interface TimeSlotsQuery {
    serviceIds: string[];
    timeZone: string;
    fromLocalDate: string;
    toLocalDate: string;
    /** Only the first slot of each day (the calendar's month view marks days that have one). */
    maxSlotsPerDay?: number;
    includeNonBookable?: boolean;
    limit?: number;
}

export interface WixBookingsContext {
    /** The booking features of the site's plan (read once per page). */
    features(): Promise<BookingFeatures>;
    /** The business time zone, which Wix's calendar shows availability in by default. */
    timeZone(): Promise<string>;
    /** A bookable service by one of its URL slugs (`/booking-calendar/<slug>`, `/service-page/<slug>`). */
    serviceBySlug(slug: string): Promise<RawBookingService | undefined>;
    /** A service by its id (the booking form gets the id of the slot chosen on the calendar). */
    serviceById(id: string): Promise<RawBookingService | undefined>;
    /** Class sessions (and appointment openings) in a local date range, as Wix's calendar queries them. */
    timeSlots(query: TimeSlotsQuery): Promise<TimeSlot[]>;
    /** Create the booking and continue to checkout (or confirm a free booking), as the server action does. */
    createBooking: WixBookingsService['createBooking'];
    /**
     * A placed order (a confirmed booking's `orderId`) as its buyer reads it, with the texts Wix's thank-you page
     * shows; undefined for anyone else.
     */
    orderById(orderId: string): Promise<BookingOrder | undefined>;
    /**
     * The visitor's or member's own confirmed and pending bookings of a service (Wix's booking form asks "Book this
     * again?" when there is one).
     */
    serviceBookings(serviceId: string): Promise<{ id?: string; startDate?: string; status?: string }[]>;
}

/** The parts of an eCommerce order Wix's thank-you page shows. */
export interface BookingOrder {
    id: string;
    number?: string;
    billingInfo?: { contactDetails?: { firstName?: string; lastName?: string } };
    buyerInfo?: { email?: string };
    lineItems?: {
        productName?: { original?: string; translated?: string };
        descriptionLines?: { plainText?: { original?: string; translated?: string } }[];
        image?: { url?: string };
        price?: { formattedAmount?: string };
    }[];
    priceSummary?: Record<string, { formattedAmount?: string } | undefined>;
}

export const WIX_BOOKINGS_CONTEXT = createJayContext<WixBookingsContext>('wix:bookings');

interface SettingsResponse {
    bookingsSettings?: {
        features?: Record<string, { enabled?: boolean } | undefined>;
        siteProperties?: { timeZone?: string };
    };
}

export function createWixBookingsContext(wixClient: WixClient, config: WixBookingsConfig): WixBookingsContext {
    let settings: Promise<SettingsResponse['bookingsSettings']> | undefined;
    const readSettings = () =>
        (settings ??= wixFetch<SettingsResponse>(
            wixClient,
            '/_api/bookings-settings/v2/settings?fields=FEATURES&fields=SITE_PROPERTIES',
        ).then((res) => res.bookingsSettings));
    const service = createWixBookingsService(wixClient, config);
    return {
        async features() {
            const f = (await readSettings())?.features ?? {};
            return {
                groups: Boolean(f.bookingsGroups?.enabled),
                appointments: Boolean(f.bookingsAppointments?.enabled),
                courses: Boolean(f.bookingsCourses?.enabled),
                payments: Boolean(f.bookingsPayments?.enabled),
            };
        },
        async timeZone() {
            return (await readSettings())?.siteProperties?.timeZone ?? 'UTC';
        },
        async serviceBySlug(slug) {
            const res = await wixFetch<{ services?: RawBookingService[] }>(wixClient, '/bookings/v2/services/query', {
                method: 'POST',
                body: { query: { filter: { 'supportedSlugs.name': slug, hidden: false }, paging: { limit: 1 } } },
            });
            return res.services?.[0];
        },
        serviceById(id) {
            return getBookingServiceById(wixClient, id);
        },
        async timeSlots(query) {
            const res = await wixFetch<{ timeSlots?: TimeSlot[] }>(wixClient, '/_api/service-availability/v2/time-slots/event', {
                method: 'POST',
                body: {
                    serviceIds: query.serviceIds,
                    timeZone: query.timeZone,
                    fromLocalDate: query.fromLocalDate,
                    toLocalDate: query.toLocalDate,
                    includeNonBookable: query.includeNonBookable ?? true,
                    ...(query.maxSlotsPerDay ? { maxSlotsPerDay: query.maxSlotsPerDay } : {}),
                    eventFilter: {},
                    cursorPaging: { limit: query.limit ?? 1000 },
                },
            });
            return res.timeSlots ?? [];
        },
        createBooking: service.createBooking,
        async serviceBookings(serviceId) {
            const res = await wixFetch<{ extendedBookings?: { booking?: { id?: string; startDate?: string; status?: string } }[] }>(
                wixClient,
                '/_api/bookings-reader/v2/extended-bookings/query',
                {
                    method: 'POST',
                    body: {
                        query: { filter: { 'bookedEntity.slot.serviceId': serviceId, status: { $in: ['CONFIRMED', 'PENDING'] } }, cursorPaging: { limit: 100 } },
                        withBookingAllowedActions: false,
                    },
                },
            ).catch(() => ({ extendedBookings: [] }));
            return (res.extendedBookings ?? []).map((e) => e.booking ?? {}).filter((b) => b.id || b.startDate);
        },
        async orderById(orderId) {
            try {
                const res = await wixFetch<{ order?: BookingOrder }>(wixClient, `/ecom/v1/orders/${encodeURIComponent(orderId)}`);
                return res.order;
            } catch (error) {
                if (error instanceof WixApiError) return undefined; // not this visitor's or member's order
                throw error;
            }
        },
    };
}

/** Client init: the bookings context on the page's Wix client (wix-server-client's). */
export function provideWixBookingsContext(config: WixBookingsConfig): WixBookingsContext | undefined {
    const client = (useGlobalContext(WIX_CLIENT_CONTEXT) as WixClientContext | undefined)?.client;
    if (!client) return undefined;
    const context = createWixBookingsContext(client, config);
    registerGlobalContext(WIX_BOOKINGS_CONTEXT, context);
    return context;
}
