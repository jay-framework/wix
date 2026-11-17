// @vitest-environment node

/**
 * DL #52 Phase B-server (B1, B2, B4, B6, B7): the participant address on the server. Expected
 * values come from the live captures (Create Booking 2026-11-10, Create Submission 2026-11-16).
 *
 * Create Booking 400 bodies: LB0's raw captures (`create-booking-400-<case>.json`, 2026-11-16).
 * Synthetic violations are placed in the envelope Wix uses for their rule (see `createBooking400`).
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/stack-server-runtime', () => ({ registerService: vi.fn() }));
vi.mock('../lib/wix-apis/create-booking.js', () => ({ createBookingRecord: vi.fn() }));
vi.mock('../lib/wix-apis/create-booking-cart.js', () => ({ createBookingCart: vi.fn() }));
vi.mock('../lib/wix-apis/calculate-cart.js', () => ({ calculateBookingCart: vi.fn() }));
vi.mock('../lib/wix-apis/place-order.js', () => ({ placeBookingOrder: vi.fn() }));
vi.mock('../lib/wix-apis/query-services.js', () => ({
    queryBookingServices: vi.fn(),
    getBookingServiceById: vi.fn(),
}));
vi.mock('../lib/utils/booking-outcome.js', async (original) => {
    const actual = await original<typeof import('../lib/utils/booking-outcome.js')>();
    return { ...actual, describeBookingError: vi.fn(actual.describeBookingError) };
});

import {
    AddressLayoutsUnavailableError,
    createLearnedAddressFacts,
    layoutOf,
    parseBookingFormViolations,
    type RawForm,
} from '@jay-framework/wix-forms';
import { WixApiError } from '@jay-framework/wix-server-client/client';
import { createBookingRecord } from '../lib/wix-apis/create-booking.js';
import { createBookingCart } from '../lib/wix-apis/create-booking-cart.js';
import { calculateBookingCart } from '../lib/wix-apis/calculate-cart.js';
import { placeBookingOrder } from '../lib/wix-apis/place-order.js';
import { getBookingServiceById } from '../lib/wix-apis/query-services.js';
import { describeBookingError } from '../lib/utils/booking-outcome.js';
import { createWixBookingsService } from '../lib/services/create-wix-bookings-service.js';
import type { CreateBookingInput } from '../lib/types.js';
import { formsReturning, QA_FORM_ID, rawFormFixture } from './support/form-kinds.js';

const mockCreateBookingRecord = vi.mocked(createBookingRecord);
const config = {
    bookingAppId: 'app',
    staffResourceTypeId: '',
    slotWindowDays: 14,
    postCheckoutUrl: '/book',
};
const PERSON = { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };
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
const IT = { country: 'IT', addressLine: 'Via Roma 1', city: 'Milano', postalCode: '20100' };
const ZW = { country: 'ZW', addressLine: '1 st', city: 'Harare', postalCode: '0000' };

function wixFixture(name: string): any {
    const url = new URL(`../../wix-forms/test/fixtures/${name}`, import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8'));
}

/** LB0's raw Create Booking 400 (`create-booking-400-<name>.json`). */
function lb0Error(name: string): WixApiError {
    const body = wixFixture(`address/create-booking-400-${name}.json`).body;
    return new WixApiError(400, '/bookings/v2/bookings', JSON.stringify(body));
}

/**
 * A Create Booking 400 with these form violations, in the envelope Wix uses for their rule (LB0):
 * REQUIRED / UNKNOWN (schema) violations come in `details.applicationError.data.formViolations`,
 * NOT_ALLOWED / pattern / length in `details.validationError.fieldViolations[].data.formViolations`.
 */
function createBooking400(formViolations: Array<{ ruleName: string }>): WixApiError {
    const schemaRules = ['REQUIRED_VALUE_ERROR', 'UNKNOWN_VALUE_ERROR'];
    const isSchema = formViolations.every((item) => schemaRules.includes(item.ruleName));
    const body = structuredClone(
        wixFixture(
            `address/create-booking-400-${isSchema ? 'il-addressline-only' : 'us-subdivision-xx'}.json`,
        ).body,
    );
    if (isSchema) body.details.applicationError.data.formViolations = formViolations;
    else body.details.validationError.fieldViolations[0].data.formViolations = formViolations;
    return new WixApiError(400, '/bookings/v2/bookings', JSON.stringify(body));
}

const violation = (fieldName: string, ruleName: string, allowedValues?: string[]) => ({
    fieldName,
    ruleName,
    description: 'from Wix',
    ...(allowedValues ? { data: { allowedValues } } : {}),
});

function input(address: unknown): CreateBookingInput {
    return {
        serviceId: 'svc-qa',
        serviceType: 'APPOINTMENT',
        slot: {
            localStartDate: '2026-11-20T10:00:00',
            localEndDate: '2026-11-20T10:30:00',
            scheduleId: 's',
        },
        formValues: { ...PERSON, ...(address === undefined ? {} : { address: address as never }) },
        timezone: 'UTC',
        siteOrigin: 'http://localhost:3000',
    };
}

function optionalAddressForm(): RawForm {
    const form = rawFormFixture('booking-form');
    const address = form.formFields!.find((field) => field.inputOptions?.target === 'address')!;
    address.inputOptions!.required = false;
    (address.inputOptions as any).addressOptions.multilineAddressOptions.defaultCountryConfig = {
        type: 'COUNTRY',
        countryOptions: 'US',
    };
    return form;
}

function sentAddress(call = 0): unknown {
    return mockCreateBookingRecord.mock.calls[call]![1].formSubmission.address;
}

const service = () => createWixBookingsService({} as never, config);

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getBookingServiceById).mockResolvedValue({
        form: { id: QA_FORM_ID },
        payment: { options: { online: false, inPerson: true } },
    } as never);
    mockCreateBookingRecord.mockResolvedValue({ booking: { id: 'b-1' } });
    vi.mocked(createBookingCart).mockResolvedValue({ cart: { id: 'c-1' } } as never);
    vi.mocked(calculateBookingCart).mockResolvedValue({
        summary: { priceSummary: { total: { amount: '0' } } },
    } as never);
    vi.mocked(placeBookingOrder).mockResolvedValue({ orderId: 'o-1' } as never);
});

afterEach(() => vi.restoreAllMocks());

/**
 * Bug: parseBookingFormViolations read only the `validationError` envelope; Wix sends REQUIRED and
 * "additional property" violations in `details.applicationError.data.formViolations`.
 * Found in: DL #52 live QA LB0 (IL case), `evidence/dl52/LB0-parsed.json`.
 * Expected: the located keys of every raw LB0 body. Actual: `[]` for the IL body.
 */
describe('B1: parseBookingFormViolations over the raw LB0 Create Booking 400s', () => {
    it.each([
        ['us-subdivision-xx', ['address/subdivision']],
        [
            'il-addressline-only',
            ['address/streetName', 'address/streetNumber', 'address/addressLine'],
        ],
        ['us-postalcode-60', ['address/postalCode']],
        ['us-addressline-160', ['address/addressLine']],
    ])('locates %s → %j', (name, keys) => {
        expect(
            parseBookingFormViolations(lb0Error(name).responseBody).map((item) => item.key),
        ).toEqual(keys);
    });
});

/**
 * Bug: a REQUIRED 400 in the real (`applicationError`) envelope was rethrown, not turned into a
 * located `invalid` outcome, so the Q17 reveal never happened.
 * Found in: DL #52 live QA LB0. Expected: `invalid` with B1's IL keys. Actual: WixApiError thrown.
 */
describe('B1b: createBooking maps the raw IL 400', () => {
    it('returns invalid with located IL errors from the applicationError envelope', async () => {
        mockCreateBookingRecord.mockRejectedValueOnce(lb0Error('il-addressline-only'));
        const outcome = await service().createBooking(
            input({
                country: 'IL',
                streetName: 'Herzl',
                streetNumber: '1',
                city: 'Tel Aviv',
                postalCode: '6100000',
            }),
            formsReturning(rawFormFixture('booking-form')),
        );
        expect(outcome.outcome).toBe('invalid');
        expect(Object.keys((outcome as any).fieldErrors).sort()).toEqual(
            ['address/addressLine', 'address/streetName', 'address/streetNumber'].sort(),
        );
    });
});

describe('B2: getParticipantForm with an address', () => {
    it('rejects with AddressLayoutsUnavailableError when the templates fail', async () => {
        const forms = formsReturning(rawFormFixture('booking-form'));
        forms.addressTemplates.mockRejectedValue(new AddressLayoutsUnavailableError());
        await expect(service().getParticipantForm('svc-qa', forms)).rejects.toBeInstanceOf(
            AddressLayoutsUnavailableError,
        );
    });

    it('lists a second address field as unsupported', async () => {
        const form = rawFormFixture('booking-form');
        const second = structuredClone(
            form.formFields!.find((field) => field.inputOptions?.target === 'address')!,
        );
        second.id = '00000000-0000-0000-0000-0000000000aa';
        second.inputOptions!.target = 'address_2';
        form.formFields!.push(second);
        const projected = await service().getParticipantForm('svc-qa', formsReturning(form));
        expect(
            projected.fields
                .filter((field) => field.type === 'ADDRESS')
                .map((field) => field.target),
        ).toEqual(['address']);
        expect(projected.unsupportedFields.map((field) => field.target)).toEqual(['address_2']);
    });
});

describe('B4: createBooking with an address', () => {
    it('sends IL without a stray addressLine (the accepted IL shape)', async () => {
        const il = {
            country: 'IL',
            streetName: 'Herzl',
            streetNumber: '1',
            city: 'Tel Aviv',
            postalCode: '6100000',
        };
        await expect(
            service().createBooking(
                input({ ...il, addressLine: 'Herzl 1' }),
                formsReturning(rawFormFixture('booking-form')),
            ),
        ).resolves.toEqual({ outcome: 'confirmed', orderId: 'o-1' });
        expect(sentAddress()).toEqual(il);
    });

    it("refuses 'US-AL' on the server without calling Wix", async () => {
        const us = {
            country: 'US',
            addressLine: '600 Dexter Ave',
            city: 'Montgomery',
            subdivision: 'US-AL',
            postalCode: '36104',
        };
        await expect(
            service().createBooking(input(us), formsReturning(rawFormFixture('booking-form'))),
        ).resolves.toEqual({
            outcome: 'invalid',
            fieldErrors: { 'address/subdivision': 'Choose a State from the list.' },
        });
        expect(mockCreateBookingRecord).not.toHaveBeenCalled();
    });

    it('turns an IT 400 into invalid + the 20 codes, learns them, then validates against them', async () => {
        const forms = formsReturning(rawFormFixture('booking-form'));
        mockCreateBookingRecord.mockRejectedValueOnce(
            createBooking400([
                violation('address/subdivision', 'NOT_ALLOWED_VALUE_ERROR', IT_CODES),
            ]),
        );
        const first = await service().createBooking(input({ ...IT, subdivision: 'MI' }), forms);
        expect(first).toEqual({
            outcome: 'invalid',
            fieldErrors: { 'address/subdivision': 'Choose a Region from the list.' },
            fieldOptions: {
                'address/subdivision': IT_CODES.map((code) => ({ value: code, label: code })),
            },
            factsCountry: { address: 'IT' },
        });
        expect(describeBookingError).not.toHaveBeenCalled();

        const form = await service().getParticipantForm('svc-qa', forms);
        const spec = form.fields.find((field) => field.type === 'ADDRESS')!.address!;
        expect(layoutOf(spec, 'IT')!.subdivisions!.map((option) => option.value)).toEqual(IT_CODES);

        mockCreateBookingRecord.mockClear();
        await expect(
            service().createBooking(input({ ...IT, subdivision: 'MI' }), forms),
        ).resolves.toEqual({
            outcome: 'invalid',
            fieldErrors: { 'address/subdivision': 'Choose a Region from the list.' },
        });
        expect(mockCreateBookingRecord).not.toHaveBeenCalled();
        await service().createBooking(input({ ...IT, subdivision: '25' }), forms);
        expect(sentAddress()).toEqual({ ...IT, subdivision: '25' });
    });

    it('reveals ZW subdivision after a REQUIRED 400, and then sends it', async () => {
        const forms = formsReturning(rawFormFixture('booking-form'));
        mockCreateBookingRecord.mockRejectedValueOnce(
            createBooking400([violation('address/subdivision', 'REQUIRED_VALUE_ERROR')]),
        );
        await expect(service().createBooking(input(ZW), forms)).resolves.toEqual({
            outcome: 'invalid',
            fieldErrors: { 'address/subdivision': 'State/Region is required.' },
            revealedParts: { address: ['subdivision'] },
            factsCountry: { address: 'ZW' },
        });
        const form = await service().getParticipantForm('svc-qa', forms);
        const spec = form.fields.find((field) => field.type === 'ADDRESS')!.address!;
        expect(layoutOf(spec, 'ZW')!.parts.map((part) => part.part)).toContain('subdivision');

        mockCreateBookingRecord.mockClear();
        await service().createBooking(input({ ...ZW, subdivision: 'HA' }), forms);
        expect(sentAddress()).toEqual({ ...ZW, subdivision: 'HA' });
    });

    it('still throws a 400 from createBookingCart', async () => {
        const us = {
            country: 'US',
            addressLine: '600 Dexter Ave',
            city: 'Montgomery',
            subdivision: 'AL',
            postalCode: '36104',
        };
        vi.mocked(createBookingCart).mockRejectedValueOnce(
            new WixApiError(400, '/ecom/v2/carts', '{}'),
        );
        await expect(
            service().createBooking(input(us), formsReturning(rawFormFixture('booking-form'))),
        ).rejects.toBeInstanceOf(WixApiError);
    });

    it('returns FORM_UNAVAILABLE when the templates fail', async () => {
        const forms = formsReturning(rawFormFixture('booking-form'));
        forms.addressTemplates.mockRejectedValue(new AddressLayoutsUnavailableError());
        await expect(service().createBooking(input(ZW), forms)).resolves.toEqual({
            outcome: 'formUnavailable',
            failure: 'FORM_UNAVAILABLE',
            message: 'Could not load the participant form. Please try again later.',
        });
    });
});

describe('B6: an optional blank address', () => {
    it('is left out of the payload, even with its preselected country', async () => {
        await service().createBooking(
            input({ country: 'US' }),
            formsReturning(optionalAddressForm()),
        );
        expect(mockCreateBookingRecord.mock.calls[0]![1].formSubmission).toEqual(PERSON);
    });
});

describe('B7: the drift log', () => {
    const DRIFT =
        '[wix-forms] address drift: Wix rejected address/addressLine (UNKNOWN_VALUE_ERROR) for US; layout ebe1c447-8fd5-4c7a-8cf1-75b94db68698. See "Address drift" in @jay-framework/wix-forms docs/01-setup-and-troubleshooting.md.';
    const us = {
        country: 'US',
        addressLine: '600 Dexter Ave',
        city: 'Montgomery',
        subdivision: 'AL',
        postalCode: '36104',
    };

    it('logs an UNKNOWN_VALUE_ERROR once, with no visitor value', async () => {
        const forms = formsReturning(rawFormFixture('booking-form'), createLearnedAddressFacts());
        for (let attempt = 0; attempt < 2; attempt += 1) {
            mockCreateBookingRecord.mockRejectedValueOnce(
                createBooking400([violation('address/addressLine', 'UNKNOWN_VALUE_ERROR')]),
            );
            await service().createBooking(input(us), forms);
        }
        const drift = vi
            .mocked(console.warn)
            .mock.calls.filter(([line]) => String(line).includes('address drift'));
        expect(drift).toEqual([[DRIFT]]);
        expect(DRIFT).not.toContain('600 Dexter');
    });

    it('does not log a NOT_ALLOWED on an unlisted subdivision', async () => {
        mockCreateBookingRecord.mockRejectedValueOnce(
            createBooking400([
                violation('address/subdivision', 'NOT_ALLOWED_VALUE_ERROR', IT_CODES),
            ]),
        );
        await service().createBooking(
            input({ ...IT, subdivision: 'MI' }),
            formsReturning(rawFormFixture('booking-form')),
        );
        expect(
            vi
                .mocked(console.warn)
                .mock.calls.some(([line]) => String(line).includes('address drift')),
        ).toBe(false);
    });
});
