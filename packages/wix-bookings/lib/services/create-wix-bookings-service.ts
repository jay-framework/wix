import type { WixClient } from '@wix/sdk';
import { WixApiError } from '@jay-framework/wix-server-client/client';
import type { WixBookingsConfig } from '../config-loader.js';
import { MAX_SLOTS_PER_QUERY } from '../constants.js';
import {
    addressMessageFor,
    hasAddressField,
    mapAddressViolations,
    parseBookingFormViolations,
    readAddressValue,
    type ProjectedForm,
    type ProjectionOptions,
    type RawForm,
    type WixFormsService,
} from '@jay-framework/wix-forms';
import type {
    BookingFormFieldView,
    BookingSlotView,
    CreateBookingInput,
    CreateBookingOutcome,
    ParticipantFormValue,
} from '../types.js';
import type { WixBookingsService } from './wix-bookings-service-marker.js';
import {
    localDateStrInTimeZone,
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
import {
    queryBookingServices,
    getBookingServiceById,
    type RawBookingService,
} from '../wix-apis/query-services.js';
import { listAvailabilityTimeSlots } from '../wix-apis/list-availability-slots.js';
import { listEventTimeSlots } from '../wix-apis/list-event-time-slots.js';
import {
    blockingFieldLabels,
    participantFieldErrors,
    projectParticipantForm,
    postedParticipantValues,
    supportedParticipantValues,
    toFormFieldView,
} from '../utils/participant-form.js';
import { describeUnsupportedForm, FORM_UNAVAILABLE_MESSAGE } from '../utils/booking-outcome.js';
import { createParticipantFormLoader } from './participant-form-source.js';

interface CheckedParticipantForm {
    service: RawBookingService;
    formValues: Record<string, ParticipantFormValue>;
    /** The rendered fields, for mapping a Create Booking 400 back to them (DL #52 §3 step 5). */
    fields: BookingFormFieldView[];
    forms: WixFormsService;
}

/**
 * Templates and the current learned facts, per call (DL #52 §3): the raw form is cached, the
 * projection never is, so every call sees what was learned so far. A template failure throws.
 */
async function projectionOptionsFor(
    rawForm: RawForm,
    forms: WixFormsService,
): Promise<ProjectionOptions> {
    const phoneOptions = { defaultPhoneCountry: forms.config.defaultPhoneCountry };
    if (!hasAddressField(rawForm)) return phoneOptions;
    return {
        ...phoneOptions,
        addressTemplates: await forms.addressTemplates(),
        learnedFacts: forms.learnedAddressFacts().snapshot(),
        addressConfig: forms.config.address,
    };
}

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

/** The bookings operations on a Wix client: the server's (API key) or a visitor's in the browser. */
export function createWixBookingsService(
    wixClient: WixClient,
    config: WixBookingsConfig,
): WixBookingsService {
    const loadParticipantForm = createParticipantFormLoader();
    const warnOnce = createWarnOnce();

    /**
     * DL #51 §4, in this order, stopping at the first failure: resolve the form; refuse a required
     * field this site cannot show; validate every shown field; keep only shown fields' values.
     * Form problems are returned, never thrown (a throw would reach the client as UNKNOWN).
     */
    async function checkParticipantForm(
        input: CreateBookingInput,
        forms: WixFormsService,
    ): Promise<CheckedParticipantForm | CreateBookingOutcome> {
        let service: RawBookingService | undefined;
        let participantForm: ProjectedForm<BookingFormFieldView>;
        try {
            service = await getBookingServiceById(wixClient, input.serviceId);
            const { formId, rawForm } = await loadParticipantForm(service, forms);
            const options = await projectionOptionsFor(rawForm, forms);
            participantForm = projectParticipantForm(rawForm, formId, warnOnce, options);
        } catch (error) {
            console.error('[wix-bookings] could not load the participant form', {
                serviceId: input.serviceId,
                error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            });
            return {
                outcome: 'formUnavailable',
                failure: 'FORM_UNAVAILABLE',
                message: FORM_UNAVAILABLE_MESSAGE,
            };
        }
        const blocking = blockingFieldLabels(participantForm);
        if (blocking.length) {
            return {
                outcome: 'formUnavailable',
                failure: 'FORM_UNSUPPORTED',
                message: describeUnsupportedForm(blocking),
            };
        }
        const fieldErrors = participantFieldErrors(participantForm.fields, input.formValues);
        if (Object.keys(fieldErrors).length) return { outcome: 'invalid', fieldErrors };
        return {
            service: service!,
            formValues: postedParticipantValues(
                participantForm.fields,
                supportedParticipantValues(participantForm.fields, input.formValues),
            ),
            fields: participantForm.fields,
            forms,
        };
    }

    return {
        async listServices() {
            const items = await queryBookingServices(wixClient, config.bookingAppId);
            return items
                .filter((item) => !item.hidden)
                .map((item) => mapService(item as Parameters<typeof mapService>[0]));
        },

        async listSlots({ serviceId, serviceType, timezone, windowDays }) {
            const now = new Date();
            const tz = timezone ?? 'UTC';
            const from = localDateStrInTimeZone(now, tz);
            const days = windowDays ?? config.slotWindowDays;
            const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
            const toStr = localDateStrInTimeZone(to, tz);
            const slotQueryOptions = { maxSlots: MAX_SLOTS_PER_QUERY };

            if (serviceType === 'APPOINTMENT') {
                const timeSlots = await listAvailabilityTimeSlots(
                    wixClient,
                    {
                        serviceId,
                        fromLocalDate: from,
                        toLocalDate: toStr,
                        timeZone: tz,
                    },
                    slotQueryOptions,
                );
                return timeSlots
                    .map((slot) => mapAppointmentSlot(slot))
                    .filter((slot): slot is BookingSlotView => slot !== null);
            }

            const timeSlots = await listEventTimeSlots(
                wixClient,
                {
                    serviceIds: [serviceId],
                    fromLocalDate: from,
                    toLocalDate: toStr,
                    timeZone: tz,
                },
                slotQueryOptions,
            );
            return timeSlots
                .map((slot) => mapClassSlot(slot))
                .filter((slot): slot is BookingSlotView => slot !== null);
        },

        async getParticipantForm(serviceId, forms) {
            // The id goes into a query filter: an object here could widen it (DL #51 Q15).
            if (typeof serviceId !== 'string' || !serviceId) {
                throw new Error('Service ID is missing.');
            }
            const service = await getBookingServiceById(wixClient, serviceId);
            const { formId, rawForm } = await loadParticipantForm(service, forms);
            const options = await projectionOptionsFor(rawForm, forms);
            return projectParticipantForm(rawForm, formId, warnOnce, options);
        },

        async createBooking(input, forms) {
            const checked = await checkParticipantForm(input, forms);
            if ('outcome' in checked) return checked;
            return bookAndCheckout(
                wixClient,
                config,
                checked.service,
                { ...input, formValues: checked.formValues },
                checked,
            );
        },
    };
}

/**
 * The booking and checkout calls with no form checks: for the browser context (static export),
 * which has no server and no forms service. The server action always goes through `createBooking`.
 */
export function createUncheckedBooking(
    wixClient: WixClient,
    config: WixBookingsConfig,
): (input: CreateBookingInput) => Promise<CreateBookingOutcome> {
    return async (input) => {
        const service = await getBookingServiceById(wixClient, input.serviceId);
        return bookAndCheckout(wixClient, config, service, input);
    };
}

async function bookAndCheckout(
    wixClient: WixClient,
    config: WixBookingsConfig,
    rawService: RawBookingService | undefined,
    input: CreateBookingInput,
    checked?: CheckedParticipantForm,
): Promise<CreateBookingOutcome> {
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
        // Any staff member of the configured staff resource type; without one, the slot's own (a class
        // session names its staff; Wix rejects an empty resource type id).
        ...(config.staffResourceTypeId
            ? {
                  resourceSelections: [
                      {
                          resourceTypeId: config.staffResourceTypeId,
                          selectionMethod: 'ANY_RESOURCE',
                      },
                  ],
              }
            : {}),
    };

    if (input.serviceType === 'APPOINTMENT') {
        slotData.scheduleId = input.slot.scheduleId;
    } else {
        slotData.eventId = input.slot.eventId;
    }

    let bookingData: Awaited<ReturnType<typeof createBookingRecord>>;
    try {
        bookingData = await createBookingRecord(wixClient, {
            booking: {
                bookedEntity: { slot: slotData },
                selectedPaymentOption: paymentPreference,
                totalParticipants: 1,
            },
            formSubmission: input.formValues,
        });
    } catch (error) {
        const invalid = checked ? invalidFromFormViolations(error, input, checked) : undefined;
        if (invalid) return invalid;
        throw error;
    }

    const bookingId = bookingData.booking.id;
    const cartData = await createBookingCart(wixClient, bookingId, config.bookingAppId);
    const cartId = cartData.cart.id;
    const calcData = await calculateBookingCart(wixClient, cartId);
    const total = parseFloat(calcData.summary?.priceSummary?.total?.amount ?? '0');

    if (total > 0) {
        const postFlowUrl = new URL(config.postCheckoutUrl, input.siteOrigin).href;
        const redirectUrl = await resolvePaidCheckoutRedirectUrl(wixClient, cartId, postFlowUrl);
        return { outcome: 'redirect', redirectUrl };
    }

    const { orderId } = await placeBookingOrder(wixClient, cartId);
    return { outcome: 'confirmed', ...(orderId ? { orderId } : {}) };
}

/**
 * A Create Booking 400 with located form violations is an `invalid` outcome, never a throw
 * (DL #52 §3 step 5). Learned subdivisions and revealed parts are written to the store first.
 * Only `createBookingRecord` is covered: cart and checkout errors keep their own paths.
 */
function invalidFromFormViolations(
    error: unknown,
    input: CreateBookingInput,
    checked: CheckedParticipantForm,
): CreateBookingOutcome | undefined {
    if (!(error instanceof WixApiError) || error.status !== 400) return undefined;
    const violations = parseBookingFormViolations(error.responseBody);
    if (!violations.length) return undefined;
    const views = checked.fields.map(toFormFieldView);
    const mapped = mapAddressViolations({
        violations,
        fields: views.filter((field) => field.inputType === 'address'),
        values: input.formValues,
        facts: checked.forms.learnedAddressFacts(),
    });
    const fieldErrors = { ...mapped.fieldErrors };
    for (const violation of mapped.unhandled) {
        const field = views.find((candidate) => candidate.target === violation.key);
        fieldErrors[violation.key] ??= field
            ? addressMessageFor(field, readAddressValue(undefined), violation)
            : (violation.wixMessage ?? 'Please check this value.');
    }
    return {
        outcome: 'invalid',
        fieldErrors,
        ...(Object.keys(mapped.fieldOptions).length ? { fieldOptions: mapped.fieldOptions } : {}),
        ...(Object.keys(mapped.revealedParts).length
            ? { revealedParts: mapped.revealedParts }
            : {}),
        ...(Object.keys(mapped.factsCountry).length ? { factsCountry: mapped.factsCountry } : {}),
    };
}

/** Each distinct message once per service instance: a cached form is projected on every request. */
function createWarnOnce(): (message: string) => void {
    const warned = new Set<string>();
    return (message) => {
        if (warned.has(message)) return;
        warned.add(message);
        console.warn(message);
    };
}
