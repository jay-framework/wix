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
     * DL #51 test 6, flipped by DL #52: the default form's required address is no longer
     *   FORM_UNSUPPORTED; it renders through the `address` tag, not as a `formFields` input.
     */
    it('should show the default form with its address (no FORM_UNSUPPORTED)', async () => {
        const flow = await openForm(rawFormFixture('default-form'), ZERO_FORM_ID);

        expect(getParticipantForm).toHaveBeenCalledWith({ serviceId: QA_SERVICE.id });
        expect(flow.viewState.bookingFailure).toBe(BookingFailure.NONE);
        expect(flow.viewState.showForm).toBe(true);
        expect(
            flow.viewState.formFields.map((field: { target: string }) => field.target),
        ).not.toContain('address');
        expect(flow.viewState.address.present).toBe(true);
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

const IT_CODES = [
    '21',
    '23',
    '25',
    '32',
    '34',
    '36',
    '42',
    '45',
    '52',
    '55',
    '57',
    '62',
    '65',
    '67',
    '72',
    '75',
    '77',
    '78',
    '82',
    '88',
];

function fillPerson(flow: BookingFlowHarness): void {
    flow.input('first_name').value = 'Ada';
    flow.input('last_name').value = 'Lovelace';
    flow.input('email').value = 'ada@example.com';
}

async function fillAddress(flow: BookingFlowHarness, parts: Record<string, string>): Promise<void> {
    for (const [part, value] of Object.entries(parts)) {
        flow.typeAddress(
            part,
            value,
            part === 'subdivision' && !flow.viewState.address.subdivision.listed ? 'text' : 'input',
        );
        await flush();
    }
}

function sentAddress(call = 0): Record<string, string> {
    return vi.mocked(createBooking).mock.calls[call]![0].formValues.address as Record<
        string,
        string
    >;
}

const IT = { addressLine: 'Via Roma 1', city: 'Milano', postalCode: '20100' };
const ZW = { addressLine: '1 st', city: 'Harare', postalCode: '0000' };

describe('B3: the address in booking-flow (DL #52)', () => {
    it('renders per country: US listed with names, IL streets, IT free text', async () => {
        const flow = await openForm(rawFormFixture('default-form'), ZERO_FORM_ID);
        flow.typeAddress('country', 'US');
        await flush();
        const us = flow.viewState.address;
        expect([
            us.subdivision.shown,
            us.subdivision.listed,
            us.subdivision.options.length,
        ]).toEqual([true, true, 54]);
        expect(
            us.subdivision.options.find((option: { value: string }) => option.value === 'AL'),
        ).toEqual({ value: 'AL', label: 'Alabama' });
        flow.typeAddress('country', 'IL');
        await flush();
        const il = flow.viewState.address;
        expect([il.streetName.shown, il.addressLine2.shown, il.subdivision.shown]).toEqual([
            true,
            true,
            false,
        ]);
        flow.typeAddress('country', 'IT');
        await flush();
        expect(flow.viewState.address.subdivision.listed).toBe(false);
    });

    it('IT: a learned list replaces the typed code, then 25 is sent; none chosen fails on the client', async () => {
        const flow = await openForm(rawFormFixture('default-form'), ZERO_FORM_ID);
        fillPerson(flow);
        flow.typeAddress('country', 'IT');
        await flush();
        await fillAddress(flow, { ...IT, subdivision: 'MI' });
        vi.mocked(createBooking).mockResolvedValueOnce({
            outcome: 'invalid',
            fieldErrors: { 'address/subdivision': 'Choose a Region from the list.' },
            fieldOptions: {
                'address/subdivision': IT_CODES.map((code) => ({ value: code, label: code })),
            },
            factsCountry: { address: 'IT' },
        } as never);
        await book(flow);

        const subdivision = flow.viewState.address.subdivision;
        expect([subdivision.listed, subdivision.options.length, subdivision.value]).toEqual([
            true,
            20,
            '',
        ]);
        expect(subdivision.error).toBe('Choose a Region from the list.');
        expect(flow.addressDomValue('subdivision', 'text')).toBe('');

        vi.mocked(createBooking).mockClear();
        await book(flow);
        expect(flow.viewState.bookingFailure).toBe(BookingFailure.VALIDATION);
        expect(flow.viewState.bookingError).toBe('Choose a Region from the list.');
        expect(createBooking).not.toHaveBeenCalled();

        vi.mocked(createBooking).mockResolvedValueOnce({ outcome: 'confirmed' } as never);
        flow.typeAddress('subdivision', '25');
        await flush();
        await book(flow);
        expect(sentAddress().subdivision).toBe('25');
    });

    it('ZW: a revealed subdivision is shown, required, free text, and sent', async () => {
        const flow = await openForm(rawFormFixture('default-form'), ZERO_FORM_ID);
        fillPerson(flow);
        flow.typeAddress('country', 'ZW');
        await flush();
        await fillAddress(flow, ZW);
        vi.mocked(createBooking).mockResolvedValueOnce({
            outcome: 'invalid',
            fieldErrors: { 'address/subdivision': 'State/Region is required.' },
            revealedParts: { address: ['subdivision'] },
            factsCountry: { address: 'ZW' },
        } as never);
        await book(flow);
        const revealed = flow.viewState.address.subdivision;
        expect([revealed.shown, revealed.required, revealed.listed]).toEqual([true, true, false]);

        vi.mocked(createBooking).mockClear();
        await book(flow);
        expect(flow.viewState.address.subdivision.error).toBe('State/Region is required.');
        expect(createBooking).not.toHaveBeenCalled();

        vi.mocked(createBooking).mockResolvedValueOnce({ outcome: 'confirmed' } as never);
        flow.typeAddress('subdivision', 'HA', 'text');
        await flush();
        await book(flow);
        expect(sentAddress()).toEqual({ country: 'ZW', ...ZW, subdivision: 'HA' });
    });

    /** Review round 3, m7: facts for another country than the one now chosen are not applied to it. */
    it('applies learned facts to the country the server names, not the one chosen since', async () => {
        const flow = await openForm(rawFormFixture('default-form'), ZERO_FORM_ID);
        fillPerson(flow);
        flow.typeAddress('country', 'IT');
        await flush();
        await fillAddress(flow, { ...IT, subdivision: 'MI' });
        vi.mocked(createBooking).mockImplementationOnce(async () => {
            flow.typeAddress('country', 'ES');
            await flush();
            return {
                outcome: 'invalid',
                fieldErrors: { 'address/subdivision': 'Choose a Region from the list.' },
                fieldOptions: {
                    'address/subdivision': IT_CODES.map((code) => ({ value: code, label: code })),
                },
                factsCountry: { address: 'IT' },
            } as never;
        });
        await book(flow);
        flow.typeAddress('country', 'AT');
        await flush();
        expect(flow.viewState.address.subdivision.listed).toBe(false);
        flow.typeAddress('country', 'IT');
        await flush();
        expect(flow.viewState.address.subdivision.options).toHaveLength(20);
    });

    it('city empty → VALIDATION and the city part error', async () => {
        const flow = await openForm(rawFormFixture('default-form'), ZERO_FORM_ID);
        fillPerson(flow);
        flow.typeAddress('country', 'US');
        await flush();
        await fillAddress(flow, {
            addressLine: '600 Dexter Ave',
            subdivision: 'AL',
            postalCode: '36104',
        });
        await book(flow);
        expect(flow.viewState.bookingFailure).toBe(BookingFailure.VALIDATION);
        expect(flow.viewState.address.city.error).toBe('City is required.');
        expect(createBooking).not.toHaveBeenCalled();
    });

    it('selecting a slot again resets the address', async () => {
        const flow = await openForm(rawFormFixture('default-form'), ZERO_FORM_ID);
        flow.typeAddress('country', 'US');
        await flush();
        flow.selectSlot(SLOT.id);
        await flush();
        expect(flow.viewState.address.country.value).toBe('');
    });

    it('shows FORM_UNAVAILABLE when the participant form (its templates) cannot load', async () => {
        vi.mocked(getParticipantForm).mockRejectedValue(
            new Error('Could not load the address layouts. Please try again later.'),
        );
        const flow = mountBookingFlow();
        flow.selectService(QA_SERVICE.id);
        await flush();
        flow.selectSlot(SLOT.id);
        await flush();
        expect(flow.viewState.bookingFailure).toBe(BookingFailure.FORM_UNAVAILABLE);
        expect(flow.viewState.address.present).toBe(false);
    });
});

function defaultUsForm(): RawForm {
    const form = rawFormFixture('booking-form');
    const address = form.formFields!.find((field) => field.inputOptions?.target === 'address')!;
    (address.inputOptions as any).addressOptions.multilineAddressOptions.defaultCountryConfig = {
        type: 'COUNTRY',
        countryOptions: 'US',
    };
    return form;
}

/**
 * Bug: the default country reached the view state (`initialCountry: "US"`, US parts shown), but
 * was never written to the country `<select>`: `reflectAddressInputs` skipped `country`, and
 * `resetAddress` did not reflect at all.
 * Found in: DL #52 live QA L6. Expected: the select shows US on load and after a reset.
 * Actual: the select's value is "" ("Choose…").
 */
describe('the default country in booking-flow (DL #52 live QA L6)', () => {
    it('writes the default country to the country select on load', async () => {
        const flow = await openForm(defaultUsForm(), CONTACT_FORM_ID);
        expect(flow.viewState.address.country.value).toBe('US');
        expect(flow.addressDomValue('country')).toBe('US');
    });

    it('writes it again after the form is reset and reopened', async () => {
        const flow = await openForm(defaultUsForm(), CONTACT_FORM_ID);
        flow.typeAddress('country', 'IL');
        await flush();
        flow.backToServices();
        await flush();
        flow.selectService(QA_SERVICE.id);
        await flush();
        flow.selectSlot(SLOT.id);
        await flush();
        expect(flow.addressDomValue('country')).toBe('US');
    });
});
