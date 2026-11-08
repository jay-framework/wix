/**
 * Booking-flow outcomes as contract variants plus English default text (DL#46).
 * Pages branch on the variant for their own copy; the message is only a default.
 */

import {
    BookingFailure,
    BookingState,
    ServicesFailure,
} from '../contracts/booking-flow.jay-contract';

export interface Outcome<Failure> {
    failure: Failure;
    message: string;
}

export function describeServicesError(error: unknown): Outcome<ServicesFailure> {
    const rawMessage = error instanceof Error ? error.message : '';
    if (rawMessage.includes('403')) {
        return {
            failure: ServicesFailure.PERMISSION,
            message:
                'Bookings API access denied. Add Wix Bookings permission to your API key in the Wix dashboard.',
        };
    }
    return {
        failure: ServicesFailure.UNKNOWN,
        message: rawMessage || 'Could not load booking services.',
    };
}

export function describeBookingError(error: unknown): Outcome<BookingFailure> {
    const rawMessage = error instanceof Error ? error.message : '';
    if (rawMessage.includes('/ecom/v2/carts') && rawMessage.includes('403')) {
        return {
            failure: BookingFailure.CHECKOUT_PERMISSION,
            message:
                'Checkout API access denied. Add Wix eCommerce (carts/checkout) permission to your API key in the Wix dashboard.',
        };
    }
    if (rawMessage.includes('redirect-session') && rawMessage.includes('400')) {
        return {
            failure: BookingFailure.CHECKOUT_REDIRECT_REJECTED,
            message:
                'Checkout redirect rejected. In Wix Dashboard → Headless Settings → your client → Allowed redirect domains, add localhost:3000 for local dev (or your deployed domain).',
        };
    }
    if (rawMessage.includes('get-checkout-url')) {
        return {
            failure: BookingFailure.SITE_NOT_PUBLISHED,
            message:
                'Could not open Wix checkout. Publish your Wix site (hosted checkout requires a published site).',
        };
    }
    return {
        failure: BookingFailure.UNKNOWN,
        message: rawMessage || 'Booking failed. Please try again.',
    };
}

export function bookingStateOf(state: {
    isBooking: boolean;
    isConfirmed: boolean;
    failure: BookingFailure;
}): BookingState {
    if (state.failure !== BookingFailure.NONE) return BookingState.FAILED;
    if (state.isBooking) return BookingState.BOOKING;
    if (state.isConfirmed) return BookingState.CONFIRMED;
    return BookingState.IDLE;
}
