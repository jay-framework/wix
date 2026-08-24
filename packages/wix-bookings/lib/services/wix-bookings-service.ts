import type { WixClient } from '@wix/sdk';
import { WixApiError } from '@jay-framework/wix-server-client';
import { registerService } from '@jay-framework/stack-server-runtime';
import type { WixBookingsConfig } from '../config-loader.js';
import type {
    BookingServiceView,
    BookingSlotView,
} from '../types.js';
import {
    WIX_BOOKINGS_SERVICE,
    type WixBookingsService,
} from './wix-bookings-service-marker.js';
import {
    localDateStr,
    mapAppointmentSlot,
    mapClassSlot,
    mapService,
    paymentPreferenceFromService,
} from '../utils/format.js';
import { createBookingRecord } from '../wix-apis/create-booking.js';
import { createBookingCart } from '../wix-apis/create-booking-cart.js';
import { calculateBookingCart } from '../wix-apis/calculate-cart.js';
import { placeBookingOrder } from '../wix-apis/place-order.js';
import { createBookingRedirectSession } from '../wix-apis/create-redirect-session.js';
import { getBookingCheckoutUrl } from '../wix-apis/get-checkout-url.js';
import { queryBookingServices, getBookingServiceById } from '../wix-apis/query-services.js';
import { listAvailabilityTimeSlots } from '../wix-apis/list-availability-slots.js';
import { listEventTimeSlots } from '../wix-apis/list-event-time-slots.js';

async function resolvePaidCheckoutRedirectUrl(
    wixClient: WixClient,
    cartId: string,
    postFlowUrl: string,
): Promise<string> {
    try {
        const redirectData = await createBookingRedirectSession(wixClient, cartId, postFlowUrl);
        const redirectUrl = redirectData.redirectSession?.fullUrl;
        if (redirectUrl) {
            return redirectUrl;
        }
    } catch (error) {
        if (!(error instanceof WixApiError) || (error.status !== 400 && error.status !== 404)) {
            throw error;
        }
    }

    const checkoutUrlData = await getBookingCheckoutUrl(wixClient, cartId);
    const checkoutUrl = checkoutUrlData.checkoutUrl;
    if (!checkoutUrl) {
        throw new Error(
            'Checkout redirect failed. Add your site origin to Allowed redirect domains in Wix Headless Settings, or publish the site so get-checkout-url can return a checkout page.',
        );
    }
    return checkoutUrl;
}

export function provideWixBookingsService(
    wixClient: WixClient,
    config: WixBookingsConfig,
): WixBookingsService {
    const service: WixBookingsService = {
        async listServices() {
            const items = await queryBookingServices(wixClient, config.bookingAppId);
            return items
                .filter((item) => !item.hidden)
                .map((item) => mapService(item as Parameters<typeof mapService>[0]));
        },

        async listSlots({ serviceId, serviceType, timezone, windowDays }) {
            const now = new Date();
            const from = localDateStr(now);
            const days = windowDays ?? config.slotWindowDays;
            const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
            const toStr = localDateStr(to);
            const tz = timezone ?? 'UTC';

            if (serviceType === 'APPOINTMENT') {
                const timeSlots = await listAvailabilityTimeSlots(wixClient, {
                    serviceId,
                    fromLocalDate: from,
                    toLocalDate: toStr,
                    timeZone: tz,
                });
                return timeSlots
                    .map((slot) => mapAppointmentSlot(slot))
                    .filter((slot): slot is BookingSlotView => slot !== null);
            }

            const timeSlots = await listEventTimeSlots(wixClient, {
                serviceIds: [serviceId],
                fromLocalDate: from,
                toLocalDate: toStr,
                timeZone: tz,
            });
            return timeSlots
                .map((slot) => mapClassSlot(slot))
                .filter((slot): slot is BookingSlotView => slot !== null);
        },

        async createBooking(input) {
            const rawService = await getBookingServiceById(wixClient, input.serviceId);
            const paymentPreference =
                input.paymentPreference ??
                (rawService
                    ? paymentPreferenceFromService(
                          rawService as Parameters<typeof paymentPreferenceFromService>[0],
                      )
                    : 'ONLINE');

            const slotData: Record<string, unknown> = {
                serviceId: input.serviceId,
                startDate: input.slot.localStartDate,
                endDate: input.slot.localEndDate,
                timezone: input.timezone,
                location: { locationType: 'OWNER_BUSINESS' },
                resourceSelections: [
                    {
                        resourceTypeId: config.staffResourceTypeId,
                        selectionMethod: 'ANY_RESOURCE',
                    },
                ],
            };

            if (input.serviceType === 'APPOINTMENT') {
                slotData.scheduleId = input.slot.scheduleId;
            } else {
                slotData.eventId = input.slot.eventId;
            }

            const bookingData = await createBookingRecord(wixClient, {
                booking: {
                    bookedEntity: { slot: slotData },
                    selectedPaymentOption: paymentPreference,
                    totalParticipants: 1,
                },
                formSubmission: input.formValues,
            });

            const bookingId = bookingData.booking.id;
            const cartData = await createBookingCart(wixClient, bookingId, config.bookingAppId);
            const cartId = cartData.cart.id;
            const calcData = await calculateBookingCart(wixClient, cartId);
            const total = parseFloat(calcData.summary?.priceSummary?.total?.amount ?? '0');

            if (total > 0) {
                const postFlowUrl = new URL(config.postCheckoutUrl, input.siteOrigin).href;
                const redirectUrl = await resolvePaidCheckoutRedirectUrl(
                    wixClient,
                    cartId,
                    postFlowUrl,
                );
                return { outcome: 'redirect', redirectUrl };
            }

            await placeBookingOrder(wixClient, cartId);
            return { outcome: 'confirmed' };
        },
    };

    registerService(WIX_BOOKINGS_SERVICE, service);
    return service;
}

export { WIX_BOOKINGS_SERVICE, type WixBookingsService } from './wix-bookings-service-marker.js';
