// @vitest-environment node

/**
 * DL #51 tests 5, 8 and 18: bookings reads its participant form through Get Form, with real
 * `required` flags, and lists what it cannot show instead of dropping it. Expected values come
 * from the log's fixture table (bookings column), never from current output.
 */

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

vi.mock('@jay-framework/stack-server-runtime', () => ({
    registerService: vi.fn(),
}));
vi.mock('../lib/wix-apis/query-services.js', () => ({
    queryBookingServices: vi.fn(),
    getBookingServiceById: vi.fn(),
}));

import { ActionError } from '@jay-framework/fullstack-component';
import { readFieldKey } from '@jay-framework/wix-forms';
import { getBookingServiceById } from '../lib/wix-apis/query-services.js';
import { createWixBookingsService } from '../lib/services/create-wix-bookings-service.js';
import { getParticipantForm } from '../lib/actions/bookings-actions.js';
import { toBookingFieldType, toFormFieldView } from '../lib/utils/participant-form.js';
import type { BookingFormFieldView } from '../lib/types.js';
import {
    QA_FORM_ID,
    ZERO_FORM_ID,
    formsReturning,
    rawFormFixture,
    type GetFormFixture,
} from './support/form-kinds.js';

const mockGetBookingServiceById = vi.mocked(getBookingServiceById);
const mockClient = {} as Parameters<typeof createWixBookingsService>[0];
const config = {
    bookingAppId: 'booking-app-1',
    staffResourceTypeId: '',
    slotWindowDays: 14,
    postCheckoutUrl: '/book',
};

function fieldOf(fixture: GetFormFixture, target: string) {
    const raw = (rawFormFixture(fixture).formFields ?? []).find(
        (field) => field.inputOptions?.target === target,
    );
    if (!raw) throw new Error(`no field ${target} in ${fixture}`);
    return raw;
}

/** The log's fixture table, bookings 1b column: undefined = unsupported. */
const BOOKING_TYPE: Array<[GetFormFixture, string, BookingFormFieldView['type'] | undefined]> = [
    ['booking-form-all-kinds', 'first_name', 'STRING'],
    ['booking-form-all-kinds', 'last_name', 'STRING'],
    ['booking-form-all-kinds', 'phone', 'PHONE'],
    ['booking-form-all-kinds', 'email', 'EMAIL'],
    ['booking-form-all-kinds', 'address', undefined],
    ['booking-form-all-kinds', 'add_your_message', 'STRING'],
    ['booking-form-all-kinds', 'long_answer_1135', 'STRING'],
    ['booking-form-all-kinds', 'form_field_e966', 'BOOLEAN'],
    ['booking-form-all-kinds', 'dropdown_7b7d', undefined],
    ['booking-form-all-kinds', 'date_picker_99d5', undefined],
    ['booking-form-all-kinds', 'multi_choice_acf9', undefined],
    ['booking-form-all-kinds', 'file_upload_1ffc', undefined],
    ['contact-form', 'first_name_5820', 'STRING'],
    ['contact-form', 'email_7e06', 'EMAIL'],
    ['contact-form', 'interests', undefined],
    ['contact-form', 'country', undefined],
    ['contact-form', 'form_field_aa5f', 'BOOLEAN'],
];

const noView = { placeholder: '', options: [] };

/** booking-form.json and default-form.json (F4: the same 7 fields), in layout order. */
const BOOKING_FORM_PROJECTION = {
    fields: [
        {
            target: 'first_name',
            label: 'First name',
            type: 'STRING',
            required: true,
            longText: false,
            ...noView,
        },
        {
            target: 'last_name',
            label: 'Last name',
            type: 'STRING',
            required: true,
            longText: false,
            ...noView,
        },
        {
            target: 'email',
            label: 'Email',
            type: 'EMAIL',
            required: true,
            longText: false,
            ...noView,
        },
        {
            target: 'phone',
            label: 'Phone',
            type: 'PHONE',
            required: false,
            longText: false,
            ...noView,
        },
        {
            target: 'add_your_message',
            label: 'Add your message',
            type: 'STRING',
            required: false,
            longText: true,
            ...noView,
        },
    ],
    unsupportedFields: [
        {
            target: 'address',
            label: 'Multi-line address',
            wixKind: 'ADDRESS/MULTILINE_ADDRESS',
            required: true,
        },
    ],
};

describe('toBookingFieldType (DL #51 test 5)', () => {
    it.each(BOOKING_TYPE)('%s %s → %s', (fixture, target, type) => {
        expect(toBookingFieldType(readFieldKey(fieldOf(fixture, target)))).toBe(type);
    });
});

describe('toFormFieldView', () => {
    const base = { target: 't', label: 'T', required: true, placeholder: '', options: [] };

    it.each([
        [{ ...base, type: 'STRING', longText: true }, 'textarea'],
        [{ ...base, type: 'STRING', longText: false }, 'text'],
        [{ ...base, type: 'EMAIL', longText: false }, 'email'],
        [{ ...base, type: 'PHONE', longText: false }, 'tel'],
        [{ ...base, type: 'URL', longText: false }, 'url'],
        [{ ...base, type: 'BOOLEAN', longText: false }, 'checkbox'],
    ] as Array<[BookingFormFieldView, string]>)('maps %j to %s', (view, inputType) => {
        expect(toFormFieldView(view)).toMatchObject({
            target: 't',
            label: 'T',
            required: true,
            inputType,
        });
    });
});

describe('WixBookingsService.getParticipantForm (DL #51 §3)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('reads the QA form through getRawForm, in layout order, with the address unsupported', async () => {
        mockGetBookingServiceById.mockResolvedValue({ form: { id: QA_FORM_ID } });
        const forms = formsReturning(rawFormFixture('booking-form'));

        const projected = await createWixBookingsService(mockClient, config).getParticipantForm(
            'svc-qa',
            forms,
        );

        expect(projected).toEqual(BOOKING_FORM_PROJECTION);
        expect(forms.getRawForm).toHaveBeenCalledWith(QA_FORM_ID);
        expect(mockGetBookingServiceById).toHaveBeenCalledWith(mockClient, 'svc-qa');
    });

    /** F4 / Q16: the all-zero id is the site's default "Booking form", a real form. */
    it('reads the default form (all-zero id) like any other form', async () => {
        mockGetBookingServiceById.mockResolvedValue({ form: { id: ZERO_FORM_ID } });
        const forms = formsReturning(rawFormFixture('default-form'));

        const projected = await createWixBookingsService(mockClient, config).getParticipantForm(
            'svc-default',
            forms,
        );

        expect(projected).toEqual(BOOKING_FORM_PROJECTION);
        expect(forms.getRawForm).toHaveBeenCalledWith(ZERO_FORM_ID);
    });

    it('skips a hidden field with a server warning', async () => {
        const form = rawFormFixture('booking-form');
        form.formFields!.find((field) => field.inputOptions?.target === 'phone')!.hidden = true;
        mockGetBookingServiceById.mockResolvedValue({ form: { id: QA_FORM_ID } });

        const projected = await createWixBookingsService(mockClient, config).getParticipantForm(
            'svc-qa',
            formsReturning(form),
        );

        expect(projected.fields.map((field) => field.target)).not.toContain('phone');
        expect(projected.unsupportedFields.map((field) => field.target)).not.toContain('phone');
        expect(console.warn).toHaveBeenCalledWith(
            `[wix-bookings] Form ${QA_FORM_ID}: hidden field "Phone" is ignored; bookings cannot fill hidden fields.`,
        );
    });

    it('names a required hidden field in its warning', async () => {
        const form = rawFormFixture('booking-form');
        form.formFields!.find((field) => field.inputOptions?.target === 'email')!.hidden = true;
        mockGetBookingServiceById.mockResolvedValue({ form: { id: QA_FORM_ID } });

        await createWixBookingsService(mockClient, config).getParticipantForm(
            'svc-qa',
            formsReturning(form),
        );

        expect(console.warn).toHaveBeenCalledWith(
            `[wix-bookings] Form ${QA_FORM_ID}: required hidden field "Email" is ignored; bookings cannot fill hidden fields.`,
        );
    });

    it('ignores an untargeted input with a server warning', async () => {
        const form = rawFormFixture('booking-form');
        delete form.formFields!.find((field) => field.inputOptions?.target === 'phone')!
            .inputOptions!.target;
        mockGetBookingServiceById.mockResolvedValue({ form: { id: QA_FORM_ID } });

        const projected = await createWixBookingsService(mockClient, config).getParticipantForm(
            'svc-qa',
            formsReturning(form),
        );

        expect(projected.fields.map((field) => field.target)).not.toContain('phone');
        expect(console.warn).toHaveBeenCalledWith(
            `[wix-bookings] Form ${QA_FORM_ID}: field "Phone" has no target in Wix and is ignored.`,
        );
    });

    /** DL #51 test 8a. Security: a crafted form id never reaches a Get Form path. */
    it('throws for a non-GUID form id without calling getRawForm', async () => {
        mockGetBookingServiceById.mockResolvedValue({ form: { id: '../x' } });
        const forms = formsReturning(rawFormFixture('booking-form'));

        await expect(
            createWixBookingsService(mockClient, config).getParticipantForm('svc-1', forms),
        ).rejects.toThrow('Form ID is not a valid Wix form id.');
        expect(forms.getRawForm).not.toHaveBeenCalled();
    });

    it('throws when the service has no form, or does not exist', async () => {
        const forms = formsReturning(rawFormFixture('booking-form'));
        const service = createWixBookingsService(mockClient, config);

        mockGetBookingServiceById.mockResolvedValueOnce({});
        await expect(service.getParticipantForm('svc-1', forms)).rejects.toThrow(
            'This booking service has no participant form.',
        );
        mockGetBookingServiceById.mockResolvedValueOnce(undefined);
        await expect(service.getParticipantForm('svc-missing', forms)).rejects.toThrow(
            'Booking service not found.',
        );
        expect(forms.getRawForm).not.toHaveBeenCalled();
    });

    it('rejects a non-string service id before calling Wix', async () => {
        const forms = formsReturning(rawFormFixture('booking-form'));
        await expect(
            createWixBookingsService(mockClient, config).getParticipantForm(
                { $ne: null } as unknown as string,
                forms,
            ),
        ).rejects.toThrow('Service ID is missing.');
        expect(mockGetBookingServiceById).not.toHaveBeenCalled();
    });
});

describe('wixBookings.getParticipantForm query (DL #51 test 8b)', () => {
    /**
     * Bug: a non-string serviceId was refused as a 500 INTERNAL_ERROR (found live, L1 run).
     * Expected: a caller mistake is a 4xx ActionError INVALID_INPUT (as DL #49 does for form ids),
     * and the bookings service is never called.
     */
    it.each([[{ $ne: null }], [''], [undefined]])(
        'refuses serviceId %j with an INVALID_INPUT ActionError',
        async (serviceId) => {
            const bookings = { getParticipantForm: vi.fn() };
            const call = getParticipantForm.handler(
                { serviceId } as unknown as { serviceId: string },
                bookings as never,
                formsReturning(rawFormFixture('booking-form')),
            );
            await expect(call).rejects.toBeInstanceOf(ActionError);
            await expect(call).rejects.toMatchObject({ code: 'INVALID_INPUT' });
            expect(bookings.getParticipantForm).not.toHaveBeenCalled();
        },
    );

    it('accepts only a serviceId', () => {
        expectTypeOf<Parameters<typeof getParticipantForm.handler>[0]>().toEqualTypeOf<{
            serviceId: string;
        }>();
    });

    it('passes the service id and the forms service to the bookings service', async () => {
        const bookings = { getParticipantForm: vi.fn(async () => BOOKING_FORM_PROJECTION) };
        const forms = formsReturning(rawFormFixture('booking-form'));

        const result = await getParticipantForm.handler(
            { serviceId: 'svc-1' },
            bookings as never,
            forms,
        );

        expect(result).toBe(BOOKING_FORM_PROJECTION);
        expect(bookings.getParticipantForm).toHaveBeenCalledWith('svc-1', forms);
    });
});
