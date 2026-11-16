// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
    BookingFailure,
    BookingState,
    ServicesFailure,
} from '../lib/contracts/booking-flow.jay-contract';
import {
    bookingStateOf,
    describeBookingError,
    describeServicesError,
    describeUnsupportedForm,
} from '../lib/utils/booking-outcome.js';

// The contract's enums, as `jay-cli definitions` generates them.
vi.mock('../lib/contracts/booking-flow.jay-contract', () => ({
    ServicesFailure: { NONE: 0, PERMISSION: 1, UNKNOWN: 2 },
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

describe('describeServicesError', () => {
    it('should classify a 403 as PERMISSION with the API-key hint', () => {
        expect(
            describeServicesError(new Error('Wix API 403: /bookings/v2/services/query')),
        ).toEqual({
            failure: ServicesFailure.PERMISSION,
            message:
                'Bookings API access denied. Add Wix Bookings permission to your API key in the Wix dashboard.',
        });
    });

    it('should classify any other failure as UNKNOWN, keeping its message', () => {
        expect(describeServicesError(new Error('boom'))).toEqual({
            failure: ServicesFailure.UNKNOWN,
            message: 'boom',
        });
    });

    it('should fall back to the default text for a non-Error', () => {
        expect(describeServicesError('nope')).toEqual({
            failure: ServicesFailure.UNKNOWN,
            message: 'Could not load booking services.',
        });
    });
});

describe('describeBookingError', () => {
    it.each([
        [
            'Wix API 403: /ecom/v2/carts',
            BookingFailure.CHECKOUT_PERMISSION,
            /Checkout API access denied/,
        ],
        [
            'Wix API 400: /redirect-session',
            BookingFailure.CHECKOUT_REDIRECT_REJECTED,
            /Checkout redirect rejected/,
        ],
        ['get-checkout-url failed', BookingFailure.SITE_NOT_PUBLISHED, /Publish your Wix site/],
        ['slot taken', BookingFailure.UNKNOWN, /^slot taken$/],
    ])('should classify %j', (raw, failure, message) => {
        const outcome = describeBookingError(new Error(raw));
        expect(outcome.failure).toEqual(failure);
        expect(outcome.message).toMatch(message);
    });

    it('should fall back to the default text for a non-Error', () => {
        expect(describeBookingError(undefined)).toEqual({
            failure: BookingFailure.UNKNOWN,
            message: 'Booking failed. Please try again.',
        });
    });
});

describe('bookingStateOf', () => {
    const idle = { isBooking: false, isConfirmed: false, failure: BookingFailure.NONE };

    it('should be IDLE by default', () => {
        expect(bookingStateOf(idle)).toEqual(BookingState.IDLE);
    });

    it('should be BOOKING while a booking is in flight', () => {
        expect(bookingStateOf({ ...idle, isBooking: true })).toEqual(BookingState.BOOKING);
    });

    it('should be CONFIRMED once confirmed', () => {
        expect(bookingStateOf({ ...idle, isConfirmed: true })).toEqual(BookingState.CONFIRMED);
    });

    it('should be FAILED whenever there is a failure', () => {
        expect(bookingStateOf({ ...idle, failure: BookingFailure.VALIDATION })).toEqual(
            BookingState.FAILED,
        );
    });
});

describe('FORM_UNSUPPORTED (DL #51 test 16)', () => {
    it('should name the fields in the default text', () => {
        expect(describeUnsupportedForm(['Multi-line address', 'File upload'])).toBe(
            'This booking form has a required field this site cannot show yet: Multi-line address, File upload. Booking is disabled until the site is updated.',
        );
    });

    it('should be a FAILED booking state', () => {
        expect(
            bookingStateOf({
                isBooking: false,
                isConfirmed: false,
                failure: BookingFailure.FORM_UNSUPPORTED,
            }),
        ).toEqual(BookingState.FAILED);
    });

    it('should be the last member of BookingFailure (appended after UNKNOWN)', () => {
        expect(failureNames()).toEqual([
            'NONE',
            'VALIDATION',
            'FORM_UNAVAILABLE',
            'CHECKOUT_PERMISSION',
            'CHECKOUT_REDIRECT_REJECTED',
            'SITE_NOT_PUBLISHED',
            'UNKNOWN',
            'FORM_UNSUPPORTED',
        ]);
    });
});

/** Exhaustive over the contract's enum: a missing or extra member fails type-checking. */
function failureName(failure: BookingFailure): string {
    switch (failure) {
        case BookingFailure.NONE:
            return 'NONE';
        case BookingFailure.VALIDATION:
            return 'VALIDATION';
        case BookingFailure.FORM_UNAVAILABLE:
            return 'FORM_UNAVAILABLE';
        case BookingFailure.CHECKOUT_PERMISSION:
            return 'CHECKOUT_PERMISSION';
        case BookingFailure.CHECKOUT_REDIRECT_REJECTED:
            return 'CHECKOUT_REDIRECT_REJECTED';
        case BookingFailure.SITE_NOT_PUBLISHED:
            return 'SITE_NOT_PUBLISHED';
        case BookingFailure.UNKNOWN:
            return 'UNKNOWN';
        case BookingFailure.FORM_UNSUPPORTED:
            return 'FORM_UNSUPPORTED';
        default: {
            const unhandled: never = failure;
            throw new Error(`unhandled BookingFailure ${String(unhandled)}`);
        }
    }
}

function failureNames(): string[] {
    return [0, 1, 2, 3, 4, 5, 6, 7].map((value) => failureName(value as BookingFailure));
}

/**
 * Bug: a Wix 429 (rate limit) from place-order showed the raw "Wix API 429: …" text to the visitor.
 * Found in: DL #52 live QA, note A (L2 JP, L3, L4 ZW, L5). Expected: a friendly retry message,
 * no API text. Actual: "Wix API 429: /ecom/v2/carts/<id>/place-order".
 */
describe('describeBookingError on a Wix 429', () => {
    it('maps a rate-limited place-order to a friendly retry message', () => {
        expect(
            describeBookingError(new Error('Wix API 429: /ecom/v2/carts/c-1/place-order')),
        ).toEqual({
            failure: BookingFailure.UNKNOWN,
            message: 'Booking is busy right now. Please wait a minute and try again.',
        });
    });
});
