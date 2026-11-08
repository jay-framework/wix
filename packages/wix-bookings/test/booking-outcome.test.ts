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
