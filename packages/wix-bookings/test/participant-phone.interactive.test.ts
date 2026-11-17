// @vitest-environment node

/**
 * Bug: after the rebase onto DL #58, participant phones lost DL #58's E.164 normalisation.
 * Found in: rebase onto DL #58 (DL #51 moved the participant check from `validateFormSummaryField`
 *   to `validateFormField` on Get Form, where bookings set no phone rules and posted values as typed).
 * Expected (DL #58 on the DL #51 path): a parsable phone is sent to Wix as E.164; a local number
 *   uses the default country (the Phone field's own, else config `defaultPhoneCountry`); an invalid
 *   phone is refused with 'Please enter a valid phone number.' and nothing is sent.
 * Actual: `+1 202-555-0123` reached Wix as typed, and `(202) 555-0123` was refused with
 *   'Please include the country code, starting with +.' even with `defaultPhoneCountry: US`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/contracts/booking-flow.jay-contract', () => ({
    ServicesFailure: { NONE: 0, PERMISSION: 1, UNKNOWN: 2 },
    SlotsFailure: { NONE: 0, UNKNOWN: 1 },
    BookingState: { IDLE: 0, BOOKING: 1, CONFIRMED: 2, FAILED: 3 },
    BookingFailure: {
        NONE: 0,
        VALIDATION: 1,
        FORM_UNAVAILABLE: 2,
        CHECKOUT_PERMISSION: 3,
        CHECKOUT_REDIRECT_REJECTED: 4,
        SITE_NOT_PUBLISHED: 5,
        UNKNOWN: 6,
        FORM_UNSUPPORTED: 7,
    },
}));
vi.mock('../lib/actions/bookings-actions.js', () => ({
    listSlots: vi.fn(),
    getParticipantForm: vi.fn(),
    createBooking: vi.fn(),
}));
vi.mock('../lib/wix-apis/create-booking.js', () => ({ createBookingRecord: vi.fn() }));
vi.mock('../lib/wix-apis/create-booking-cart.js', () => ({ createBookingCart: vi.fn() }));
vi.mock('../lib/wix-apis/calculate-cart.js', () => ({ calculateBookingCart: vi.fn() }));
vi.mock('../lib/wix-apis/place-order.js', () => ({ placeBookingOrder: vi.fn() }));
vi.mock('../lib/wix-apis/query-services.js', () => ({
    queryBookingServices: vi.fn(),
    getBookingServiceById: vi.fn(),
}));

import type { RawForm } from '@jay-framework/wix-forms';
import { createBooking, getParticipantForm, listSlots } from '../lib/actions/bookings-actions.js';
import { createBookingRecord } from '../lib/wix-apis/create-booking.js';
import { createBookingCart } from '../lib/wix-apis/create-booking-cart.js';
import { calculateBookingCart } from '../lib/wix-apis/calculate-cart.js';
import { placeBookingOrder } from '../lib/wix-apis/place-order.js';
import { getBookingServiceById } from '../lib/wix-apis/query-services.js';
import { createWixBookingsService } from '../lib/services/create-wix-bookings-service.js';
import { BookingFailure } from '../lib/contracts/booking-flow.jay-contract';
import type { CreateBookingInput } from '../lib/types.js';
import { flush, mountBookingFlow, QA_SERVICE } from './support/booking-flow-harness.js';
import { formsReturning, QA_FORM_ID, rawFormFixture } from './support/form-kinds.js';

const INVALID_PHONE = 'Please enter a valid phone number.';
const SLOT = {
    id: 'slot-1',
    localStartDate: '2026-11-20T10:00:00',
    localEndDate: '2026-11-20T10:30:00',
    label: 'Fri, Nov 20, 10:00',
    scheduleId: 'sched-1',
    serviceType: 'APPOINTMENT' as const,
};
const PARTICIPANT = { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

/** booking-form.json (the QA service's form: optional Phone, no field country) with the address optional. */
function bookingForm(): RawForm {
    const form = rawFormFixture('booking-form');
    form.formFields!.find(
        (field) => field.inputOptions?.target === 'address',
    )!.inputOptions!.required = false;
    return form;
}

function formsWith(defaultPhoneCountry?: string) {
    const forms = formsReturning(bookingForm());
    forms.config = { ...forms.config, ...(defaultPhoneCountry ? { defaultPhoneCountry } : {}) };
    return forms;
}

function newService() {
    return createWixBookingsService({} as never, {
        bookingAppId: 'booking-app-1',
        staffResourceTypeId: '',
        slotWindowDays: 14,
        postCheckoutUrl: '/book',
    });
}

function bookingInput(phone: string): CreateBookingInput {
    return {
        serviceId: QA_SERVICE.id,
        serviceType: 'APPOINTMENT',
        slot: { localStartDate: SLOT.localStartDate, localEndDate: SLOT.localEndDate },
        formValues: { ...PARTICIPANT, phone },
        timezone: 'America/New_York',
        siteOrigin: 'http://localhost:3000',
    };
}

function postedFormSubmission() {
    return vi.mocked(createBookingRecord).mock.calls[0]![1].formSubmission;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(getBookingServiceById).mockResolvedValue({
        form: { id: QA_FORM_ID },
        payment: { options: { online: false, inPerson: true } },
    });
    vi.mocked(createBookingRecord).mockResolvedValue({ booking: { id: 'booking-1' } });
    vi.mocked(createBookingCart).mockResolvedValue({ cart: { id: 'cart-1' } } as never);
    vi.mocked(calculateBookingCart).mockResolvedValue({
        summary: { priceSummary: { total: { amount: '0' } } },
    } as never);
    vi.mocked(placeBookingOrder).mockResolvedValue({ orderId: 'order-1' } as never);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('booking flow participant phones on Get Form (DL #58 after DL #51)', () => {
    async function bookWithPhone(phone: string, defaultPhoneCountry?: string) {
        vi.stubGlobal('window', { location: { origin: 'http://localhost:3000', href: '' } });
        vi.mocked(listSlots).mockResolvedValue({ slots: [SLOT] } as never);
        vi.mocked(createBooking).mockResolvedValue({ outcome: 'confirmed' } as never);
        const participantForm = await newService().getParticipantForm(
            QA_SERVICE.id,
            formsWith(defaultPhoneCountry),
        );
        vi.mocked(getParticipantForm).mockResolvedValue(participantForm as never);
        const flow = mountBookingFlow();
        flow.selectService(QA_SERVICE.id);
        await flush();
        flow.selectSlot(SLOT.id);
        await flush();
        for (const [target, value] of Object.entries({ ...PARTICIPANT, phone })) {
            flow.input(target).value = value;
        }
        flow.book();
        await flush();
        return flow;
    }

    function postedPhone() {
        return vi.mocked(createBooking).mock.calls[0]![0].formValues.phone;
    }

    it('(a) should post a spaced international phone as E.164', async () => {
        await bookWithPhone('+1 202-555-0123');
        expect(postedPhone()).toBe('+12025550123');
    });

    it('(b) should show the invalid-phone message and send no createBooking request', async () => {
        const flow = await bookWithPhone('12');
        expect(flow.viewState.bookingFailure).toBe(BookingFailure.VALIDATION);
        expect(flow.viewState.bookingError).toBe(INVALID_PHONE);
        expect(createBooking).not.toHaveBeenCalled();
    });

    it('(c) should post an E.164 phone unchanged', async () => {
        await bookWithPhone('+12025550199');
        expect(postedPhone()).toBe('+12025550199');
    });

    it('(d) should accept a local phone with config defaultPhoneCountry and post it as E.164', async () => {
        const flow = await bookWithPhone('(202) 555-0123', 'US');
        expect(flow.viewState.bookingError).toBe('');
        expect(postedPhone()).toBe('+12025550123');
    });
});
