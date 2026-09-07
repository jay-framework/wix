/**
 * Server entry — setup, service registration, and re-exports for tooling.
 */
export { init } from './init.js';
// setup handler (setupWixBookings/setup) is tools-time — moved to ./tools (DL#179).
export { bookingFlow } from './components/booking-flow.js';
export { listServices, listSlots, createBooking } from './actions/bookings-actions.js';
export {
    provideWixBookingsService,
    WIX_BOOKINGS_SERVICE,
    type WixBookingsService,
} from './services/wix-bookings-service.js';
export type {
    BookingServiceView,
    BookingSlotView,
    BookingFormFieldView,
    CreateBookingOutcome,
} from './types.js';
