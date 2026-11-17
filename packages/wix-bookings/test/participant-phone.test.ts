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

vi.mock('../lib/wix-apis/create-booking.js', () => ({ createBookingRecord: vi.fn() }));
vi.mock('../lib/wix-apis/create-booking-cart.js', () => ({ createBookingCart: vi.fn() }));
vi.mock('../lib/wix-apis/calculate-cart.js', () => ({ calculateBookingCart: vi.fn() }));
vi.mock('../lib/wix-apis/place-order.js', () => ({ placeBookingOrder: vi.fn() }));
vi.mock('../lib/wix-apis/query-services.js', () => ({
    queryBookingServices: vi.fn(),
    getBookingServiceById: vi.fn(),
}));

import type { RawForm } from '@jay-framework/wix-forms';
import { createBookingRecord } from '../lib/wix-apis/create-booking.js';
import { createBookingCart } from '../lib/wix-apis/create-booking-cart.js';
import { calculateBookingCart } from '../lib/wix-apis/calculate-cart.js';
import { placeBookingOrder } from '../lib/wix-apis/place-order.js';
import { getBookingServiceById } from '../lib/wix-apis/query-services.js';
import { createWixBookingsService } from '../lib/services/create-wix-bookings-service.js';
import type { CreateBookingInput } from '../lib/types.js';
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
        serviceId: 'svc-qa',
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

describe('createBooking participant phones on Get Form (DL #58 after DL #51)', () => {
    it('(a) should send a spaced international phone to Wix as E.164', async () => {
        await newService().createBooking(bookingInput('+1 202-555-0123'), formsWith());
        expect(postedFormSubmission()).toMatchObject({ phone: '+12025550123' });
    });

    it('(b) should refuse an invalid phone without calling Wix', async () => {
        const outcome = await newService().createBooking(bookingInput('12'), formsWith());
        expect(outcome).toEqual({ outcome: 'invalid', fieldErrors: { phone: INVALID_PHONE } });
        expect(createBookingRecord).not.toHaveBeenCalled();
    });

    it('(c) should send an E.164 phone unchanged', async () => {
        await newService().createBooking(bookingInput('+12025550199'), formsWith());
        expect(postedFormSubmission()).toMatchObject({ phone: '+12025550199' });
    });

    it('(d) should accept a local phone with config defaultPhoneCountry and send it as E.164', async () => {
        await newService().createBooking(bookingInput('(202) 555-0123'), formsWith('US'));
        expect(postedFormSubmission()).toMatchObject({ phone: '+12025550123' });
    });
});
