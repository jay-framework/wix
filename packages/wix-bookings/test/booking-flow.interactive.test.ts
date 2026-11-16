// @vitest-environment node

/**
 * DL #51 client tests: the booking flow on Get Form (1b: tests 6, 7, 8a) and on the server's
 * returned outcomes (Phase 2: tests 9, 10). The participant form comes from the real server
 * projection of the live fixtures, so the client sees what `getParticipantForm` returns.
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
vi.mock('../lib/wix-apis/query-services.js', () => ({
    queryBookingServices: vi.fn(),
    getBookingServiceById: vi.fn(),
}));
vi.mock('../lib/utils/booking-outcome.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../lib/utils/booking-outcome.js')>();
    return { ...original, describeBookingError: vi.fn(original.describeBookingError) };
});

import { createBooking, getParticipantForm, listSlots } from '../lib/actions/bookings-actions.js';
import { getBookingServiceById } from '../lib/wix-apis/query-services.js';
import { createWixBookingsService } from '../lib/services/create-wix-bookings-service.js';
import { describeBookingError } from '../lib/utils/booking-outcome.js';
import type { RawForm } from '@jay-framework/wix-forms';
import { BookingFailure, BookingState } from '../lib/contracts/booking-flow.jay-contract';
import {
    flush,
    mountBookingFlow,
    QA_SERVICE,
    type BookingFlowHarness,
} from './support/booking-flow-harness.js';
import {
    formsReturning,
    rawFormFixture,
    ZERO_FORM_ID,
    CONTACT_FORM_ID,
} from './support/form-kinds.js';

const SLOT = {
    id: 'slot-1',
    localStartDate: '2026-11-20T10:00:00',
    localEndDate: '2026-11-20T10:30:00',
    label: 'Fri, Nov 20, 10:00',
    scheduleId: 'sched-1',
    serviceType: 'APPOINTMENT' as const,
};

/** What the real server projection returns for this Get Form schema. */
async function participantFormOf(form: RawForm, formId: string) {
    vi.mocked(getBookingServiceById).mockResolvedValueOnce({ form: { id: formId } });
    const service = createWixBookingsService({} as never, {
        bookingAppId: 'app',
        staffResourceTypeId: '',
        slotWindowDays: 14,
        postCheckoutUrl: '/book',
    });
    return service.getParticipantForm(QA_SERVICE.id, formsReturning(form));
}

/** contact-form.json minus its checkbox group: a required consent checkbox, an optional dropdown. */
function consentForm(): RawForm {
    const form = rawFormFixture('contact-form');
    form.formFields = form.formFields!.filter(
        (field) => field.inputOptions?.target !== 'interests',
    );
    return form;
}

async function openForm(form: RawForm, formId: string): Promise<BookingFlowHarness> {
    vi.mocked(getParticipantForm).mockResolvedValue(
        (await participantFormOf(form, formId)) as never,
    );
    const flow = mountBookingFlow();
    flow.selectService(QA_SERVICE.id);
    await flush();
    flow.selectSlot(SLOT.id);
    await flush();
    return flow;
}

function fillConsentForm(flow: BookingFlowHarness, consent: boolean): void {
    flow.input('first_name_5820').value = 'Ada';
    flow.input('email_7e06').value = 'ada@example.com';
    flow.input('form_field_aa5f').checked = consent;
}

async function book(flow: BookingFlowHarness): Promise<void> {
    flow.book();
    await flush();
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000', href: '' } });
    vi.mocked(listSlots).mockResolvedValue({ slots: [SLOT] } as never);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('booking flow on Get Form (DL #51 Phase 1b)', () => {
    /**
     * DL #51 test 6. Bug: a default-form service showed built-in First/Last/Email and booked
     *   without the required Address (step-11 mapped the zero id to "no form").
     * Found in: QA 2026-11-10 (qa-18, F4, F6).
     * Expected: FORM_UNSUPPORTED naming the address, no form shown, no built-in fields.
     */
    it('should disable booking with FORM_UNSUPPORTED for the default form', async () => {
        const flow = await openForm(rawFormFixture('default-form'), ZERO_FORM_ID);

        expect(getParticipantForm).toHaveBeenCalledWith({ serviceId: QA_SERVICE.id });
        expect(flow.viewState.bookingFailure).toBe(BookingFailure.FORM_UNSUPPORTED);
        expect(flow.viewState.bookingState).toBe(BookingState.FAILED);
        expect(flow.viewState.showForm).toBe(false);
        expect(flow.viewState.formFields).toEqual([]);
        expect(flow.viewState.bookingError).toBe(
            'This booking form has a required field this site cannot show yet: Multi-line address. Booking is disabled until the site is updated.',
        );
    });

    /** DL #51 test 7: a required consent checkbox is rendered and submits a boolean. */
    it('should render a required consent checkbox among the participant fields', async () => {
        const flow = await openForm(consentForm(), CONTACT_FORM_ID);

        expect(flow.viewState.showForm).toBe(true);
        expect(flow.viewState.formFields).toEqual([
            { target: 'first_name_5820', label: 'First name', type: 'STRING', required: true },
            { target: 'email_7e06', label: 'Email', type: 'EMAIL', required: true },
            {
                target: 'form_field_aa5f',
                label: 'I agree to be contacted',
                type: 'BOOLEAN',
                required: true,
            },
        ]);
    });

    it('should refuse an unchecked required checkbox with VALIDATION', async () => {
        const flow = await openForm(consentForm(), CONTACT_FORM_ID);
        fillConsentForm(flow, false);

        await book(flow);

        expect(flow.viewState.bookingFailure).toBe(BookingFailure.VALIDATION);
        expect(flow.viewState.bookingError).toBe('I agree to be contacted is required.');
        expect(createBooking).not.toHaveBeenCalled();
    });

    it('should send a checked checkbox as true and leave the optional dropdown out', async () => {
        vi.mocked(createBooking).mockResolvedValue({ outcome: 'confirmed' } as never);
        const flow = await openForm(consentForm(), CONTACT_FORM_ID);
        fillConsentForm(flow, true);

        await book(flow);

        const [input] = vi.mocked(createBooking).mock.calls[0]!;
        expect(input.formValues).toEqual({
            first_name_5820: 'Ada',
            email_7e06: 'ada@example.com',
            form_field_aa5f: true,
        });
        expect(flow.viewState.bookingState).toBe(BookingState.CONFIRMED);
    });

    /** DL #51 test 8a (client): any getParticipantForm throw is FORM_UNAVAILABLE. */
    it('should show FORM_UNAVAILABLE when the participant form cannot load', async () => {
        vi.mocked(getParticipantForm).mockRejectedValue(
            new Error('Form ID is not a valid Wix form id.'),
        );
        const flow = mountBookingFlow();
        flow.selectService(QA_SERVICE.id);
        await flush();
        flow.selectSlot(SLOT.id);
        await flush();

        expect(flow.viewState.bookingFailure).toBe(BookingFailure.FORM_UNAVAILABLE);
        expect(flow.viewState.showForm).toBe(false);
    });
});

describe('booking flow on server outcomes (DL #51 Phase 2)', () => {
    async function bookConsentFormWith(outcome: unknown): Promise<BookingFlowHarness> {
        vi.mocked(createBooking).mockResolvedValue(outcome as never);
        const flow = await openForm(consentForm(), CONTACT_FORM_ID);
        fillConsentForm(flow, true);
        await book(flow);
        return flow;
    }

    it('test 9: invalid → VALIDATION with the first rendered field’s message', async () => {
        const flow = await bookConsentFormWith({
            outcome: 'invalid',
            fieldErrors: {
                form_field_aa5f: 'I agree to be contacted is required.',
                email_7e06: 'Please enter a valid email address.',
            },
        });

        expect(flow.viewState.bookingFailure).toBe(BookingFailure.VALIDATION);
        expect(flow.viewState.bookingError).toBe('Please enter a valid email address.');
        expect(describeBookingError).not.toHaveBeenCalled();
    });

    it('test 9: invalid on a target that is not rendered → that message, never empty', async () => {
        const flow = await bookConsentFormWith({
            outcome: 'invalid',
            fieldErrors: { last_name: 'Last name is required.' },
        });

        expect(flow.viewState.bookingFailure).toBe(BookingFailure.VALIDATION);
        expect(flow.viewState.bookingError).toBe('Last name is required.');
    });

    it('test 9: formUnavailable / FORM_UNSUPPORTED → FORM_UNSUPPORTED, form hidden', async () => {
        const flow = await bookConsentFormWith({
            outcome: 'formUnavailable',
            failure: 'FORM_UNSUPPORTED',
            message: 'unsupported',
        });

        expect(flow.viewState.bookingFailure).toBe(BookingFailure.FORM_UNSUPPORTED);
        expect(flow.viewState.bookingError).toBe('unsupported');
        expect(flow.viewState.showForm).toBe(false);
        expect(describeBookingError).not.toHaveBeenCalled();
    });

    it('test 10: formUnavailable / FORM_UNAVAILABLE → FORM_UNAVAILABLE, not UNKNOWN', async () => {
        const flow = await bookConsentFormWith({
            outcome: 'formUnavailable',
            failure: 'FORM_UNAVAILABLE',
            message: 'Could not load the participant form.',
        });

        expect(flow.viewState.bookingFailure).toBe(BookingFailure.FORM_UNAVAILABLE);
        expect(flow.viewState.showForm).toBe(false);
        expect(describeBookingError).not.toHaveBeenCalled();
    });
});
