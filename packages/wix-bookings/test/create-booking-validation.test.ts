// @vitest-environment node

/**
 * DL #51 Phase 2: `createBooking` re-validates on the server, in the §4 order, and returns form
 * problems as outcomes (tests 9, 9b, 10). Wix accepts a booking that leaves out a required
 * field (F6), so this check is the only guard.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/stack-server-runtime', () => ({
    registerService: vi.fn(),
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
import { createBookingRecord } from '../lib/wix-apis/create-booking.js';
import { createBookingCart } from '../lib/wix-apis/create-booking-cart.js';
import { calculateBookingCart } from '../lib/wix-apis/calculate-cart.js';
import { placeBookingOrder } from '../lib/wix-apis/place-order.js';
import { getBookingServiceById } from '../lib/wix-apis/query-services.js';
import { createWixBookingsService } from '../lib/services/create-wix-bookings-service.js';
import { createBooking } from '../lib/actions/bookings-actions.js';
import { SLOW_RENDER_TTL } from '../lib/slow-render-defaults.js';
import type { CreateBookingInput } from '../lib/types.js';
import { formsReturning, QA_FORM_ID, rawFormFixture, ZERO_FORM_ID } from './support/form-kinds.js';

const mockCreateBookingRecord = vi.mocked(createBookingRecord);
const mockGetBookingServiceById = vi.mocked(getBookingServiceById);

const config = {
    bookingAppId: 'booking-app-1',
    staffResourceTypeId: '',
    slotWindowDays: 14,
    postCheckoutUrl: '/book',
};

const VALID_VALUES = {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
};

function bookingInput(formValues: CreateBookingInput['formValues']): CreateBookingInput {
    return {
        serviceId: 'svc-qa',
        serviceType: 'APPOINTMENT',
        slot: {
            localStartDate: '2026-11-20T10:00:00',
            localEndDate: '2026-11-20T10:30:00',
            scheduleId: 'sched-1',
        },
        formValues,
        timezone: 'Asia/Jerusalem',
        siteOrigin: 'http://localhost:3000',
    };
}

/** Test-local copy of booking-form.json with the address optional (the shared file is unchanged). */
function bookingFormWithOptionalAddress(): RawForm {
    const form = rawFormFixture('booking-form');
    form.formFields!.find(
        (field) => field.inputOptions?.target === 'address',
    )!.inputOptions!.required = false;
    return form;
}

function serviceWithForm(formId: string) {
    mockGetBookingServiceById.mockResolvedValue({
        form: { id: formId },
        payment: { options: { online: false, inPerson: true } },
    });
}

function newService() {
    return createWixBookingsService({} as never, config);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockCreateBookingRecord.mockResolvedValue({ booking: { id: 'booking-1' } });
    vi.mocked(createBookingCart).mockResolvedValue({ cart: { id: 'cart-1' } } as never);
    vi.mocked(calculateBookingCart).mockResolvedValue({
        summary: { priceSummary: { total: { amount: '0' } } },
    } as never);
    vi.mocked(placeBookingOrder).mockResolvedValue({ orderId: 'order-1' } as never);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('createBooking server re-validation (DL #51 test 9)', () => {
    it('returns invalid for a missing required first name, without calling Wix', async () => {
        serviceWithForm(QA_FORM_ID);
        const forms = formsReturning(bookingFormWithOptionalAddress());

        const outcome = await newService().createBooking(
            bookingInput({ last_name: 'Lovelace', email: 'ada@example.com' }),
            forms,
        );

        expect(outcome).toEqual({
            outcome: 'invalid',
            fieldErrors: { first_name: 'First name is required.' },
        });
        expect(mockCreateBookingRecord).not.toHaveBeenCalled();
    });

    it('lists every failing field', async () => {
        serviceWithForm(QA_FORM_ID);

        const outcome = await newService().createBooking(
            bookingInput({ last_name: 'Lovelace', email: 'not-an-email' }),
            formsReturning(bookingFormWithOptionalAddress()),
        );

        expect(outcome).toEqual({
            outcome: 'invalid',
            fieldErrors: {
                first_name: 'First name is required.',
                email: 'Please enter a valid email address.',
            },
        });
    });

    it('drops extra keys and the unsupported address key from the Wix payload', async () => {
        serviceWithForm(QA_FORM_ID);

        const outcome = await newService().createBooking(
            bookingInput({ ...VALID_VALUES, address: '600 Dexter Ave', isAdmin: 'true' }),
            formsReturning(bookingFormWithOptionalAddress()),
        );

        expect(outcome).toEqual({ outcome: 'confirmed', orderId: 'order-1' });
        expect(mockCreateBookingRecord.mock.calls[0]![1].formSubmission).toEqual(VALID_VALUES);
        expect(mockGetBookingServiceById).toHaveBeenCalledTimes(1);
    });

    it('check order: a required unsupported field wins over a missing first name', async () => {
        serviceWithForm(QA_FORM_ID);

        const outcome = await newService().createBooking(
            bookingInput({ last_name: 'Lovelace', email: 'ada@example.com' }),
            formsReturning(rawFormFixture('booking-form')),
        );

        expect(outcome).toEqual({
            outcome: 'formUnavailable',
            failure: 'FORM_UNSUPPORTED',
            message:
                'This booking form has a required field this site cannot show yet: Multi-line address. Booking is disabled until the site is updated.',
        });
        expect(mockCreateBookingRecord).not.toHaveBeenCalled();
    });

    it('resolves (does not reject) FORM_UNSUPPORTED for the default form', async () => {
        serviceWithForm(ZERO_FORM_ID);

        await expect(
            newService().createBooking(
                bookingInput(VALID_VALUES),
                formsReturning(rawFormFixture('default-form')),
            ),
        ).resolves.toMatchObject({ outcome: 'formUnavailable', failure: 'FORM_UNSUPPORTED' });
        expect(mockCreateBookingRecord).not.toHaveBeenCalled();
    });

    it('the action passes the forms service to the bookings service', async () => {
        const bookings = { createBooking: vi.fn(async () => ({ outcome: 'confirmed' as const })) };
        const forms = formsReturning(bookingFormWithOptionalAddress());
        const input = bookingInput(VALID_VALUES);

        await createBooking.handler(input, bookings as never, forms);

        expect(bookings.createBooking).toHaveBeenCalledWith(input, forms);
    });
});

describe('createBooking when the form cannot load (DL #51 test 10)', () => {
    it('returns FORM_UNAVAILABLE when Get Form fails, without calling Wix bookings', async () => {
        serviceWithForm(QA_FORM_ID);
        const forms = formsReturning(async () => {
            throw new Error('Wix API 503');
        });

        await expect(
            newService().createBooking(bookingInput(VALID_VALUES), forms),
        ).resolves.toMatchObject({ outcome: 'formUnavailable', failure: 'FORM_UNAVAILABLE' });
        expect(mockCreateBookingRecord).not.toHaveBeenCalled();
    });

    it('returns FORM_UNAVAILABLE when the service does not exist', async () => {
        mockGetBookingServiceById.mockResolvedValue(undefined);
        const forms = formsReturning(bookingFormWithOptionalAddress());

        await expect(
            newService().createBooking(bookingInput(VALID_VALUES), forms),
        ).resolves.toMatchObject({ outcome: 'formUnavailable', failure: 'FORM_UNAVAILABLE' });
        expect(forms.getRawForm).not.toHaveBeenCalled();
        expect(mockCreateBookingRecord).not.toHaveBeenCalled();
    });

    it('returns FORM_UNAVAILABLE for an invalid form id, without calling Get Form', async () => {
        serviceWithForm('../x');
        const forms = formsReturning(bookingFormWithOptionalAddress());

        await expect(
            newService().createBooking(bookingInput(VALID_VALUES), forms),
        ).resolves.toMatchObject({ outcome: 'formUnavailable', failure: 'FORM_UNAVAILABLE' });
        expect(forms.getRawForm).not.toHaveBeenCalled();
    });

    it('returns FORM_UNAVAILABLE when Get Service fails', async () => {
        mockGetBookingServiceById.mockRejectedValue(new Error('Wix API 500'));

        await expect(
            newService().createBooking(
                bookingInput(VALID_VALUES),
                formsReturning(bookingFormWithOptionalAddress()),
            ),
        ).resolves.toMatchObject({ outcome: 'formUnavailable', failure: 'FORM_UNAVAILABLE' });
        expect(mockCreateBookingRecord).not.toHaveBeenCalled();
    });
});

describe('participant form cache (DL #51 test 9b, §3a)', () => {
    it('shares one Get Form call between getParticipantForm and createBooking', async () => {
        serviceWithForm(QA_FORM_ID);
        const forms = formsReturning(bookingFormWithOptionalAddress());
        const service = newService();

        await service.getParticipantForm('svc-qa', forms);
        await service.createBooking(bookingInput(VALID_VALUES), forms);

        expect(forms.getRawForm).toHaveBeenCalledTimes(1);
    });

    it('refetches after SLOW_RENDER_TTL seconds', async () => {
        vi.useFakeTimers();
        serviceWithForm(QA_FORM_ID);
        const forms = formsReturning(bookingFormWithOptionalAddress());
        const service = newService();

        await service.getParticipantForm('svc-qa', forms);
        vi.advanceTimersByTime(SLOW_RENDER_TTL * 1000 - 1);
        await service.getParticipantForm('svc-qa', forms);
        expect(forms.getRawForm).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1);
        await service.getParticipantForm('svc-qa', forms);
        expect(forms.getRawForm).toHaveBeenCalledTimes(2);
    });

    it('refetches after a failure', async () => {
        serviceWithForm(QA_FORM_ID);
        const form = bookingFormWithOptionalAddress();
        const forms = formsReturning(form);
        forms.getRawForm.mockRejectedValueOnce(new Error('Wix API 503'));
        const service = newService();

        await expect(service.getParticipantForm('svc-qa', forms)).rejects.toThrow('Wix API 503');
        await expect(service.getParticipantForm('svc-qa', forms)).resolves.toBeDefined();
        expect(forms.getRawForm).toHaveBeenCalledTimes(2);
    });

    it('keys the cache by canonical form id: the zero id is its own entry', async () => {
        const forms = formsReturning(async (formId: string) =>
            rawFormFixture(formId === ZERO_FORM_ID ? 'default-form' : 'booking-form'),
        );
        const service = newService();

        serviceWithForm(QA_FORM_ID.toUpperCase());
        await service.getParticipantForm('svc-qa', forms);
        serviceWithForm(QA_FORM_ID);
        await service.getParticipantForm('svc-qa', forms);
        serviceWithForm(ZERO_FORM_ID);
        await service.getParticipantForm('svc-default', forms);

        expect(forms.getRawForm.mock.calls).toEqual([[QA_FORM_ID], [ZERO_FORM_ID]]);
    });
});
