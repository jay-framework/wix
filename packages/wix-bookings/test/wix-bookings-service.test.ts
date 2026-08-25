// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jay-framework/stack-server-runtime', () => ({
    registerService: vi.fn(),
}));

vi.mock('../lib/wix-apis/create-booking.js', () => ({
    createBookingRecord: vi.fn(),
}));
vi.mock('../lib/wix-apis/create-booking-cart.js', () => ({
    createBookingCart: vi.fn(),
}));
vi.mock('../lib/wix-apis/calculate-cart.js', () => ({
    calculateBookingCart: vi.fn(),
}));
vi.mock('../lib/wix-apis/place-order.js', () => ({
    placeBookingOrder: vi.fn(),
}));
vi.mock('../lib/wix-apis/create-redirect-session.js', () => ({
    createBookingRedirectSession: vi.fn(),
}));
vi.mock('../lib/wix-apis/get-checkout-url.js', () => ({
    getBookingCheckoutUrl: vi.fn(),
}));
vi.mock('../lib/wix-apis/query-services.js', () => ({
    queryBookingServices: vi.fn(),
    getBookingServiceById: vi.fn(),
}));
vi.mock('../lib/wix-apis/list-availability-slots.js', () => ({
    listAvailabilityTimeSlots: vi.fn(),
}));
vi.mock('../lib/wix-apis/list-event-time-slots.js', () => ({
    listEventTimeSlots: vi.fn(),
}));

import { createBookingRecord } from '../lib/wix-apis/create-booking.js';
import { createBookingCart } from '../lib/wix-apis/create-booking-cart.js';
import { calculateBookingCart } from '../lib/wix-apis/calculate-cart.js';
import { placeBookingOrder } from '../lib/wix-apis/place-order.js';
import { createBookingRedirectSession } from '../lib/wix-apis/create-redirect-session.js';
import { getBookingServiceById } from '../lib/wix-apis/query-services.js';
import { listAvailabilityTimeSlots } from '../lib/wix-apis/list-availability-slots.js';
import { provideWixBookingsService } from '../lib/services/wix-bookings-service.js';

const mockCreateBookingRecord = vi.mocked(createBookingRecord);
const mockCreateBookingCart = vi.mocked(createBookingCart);
const mockCalculateBookingCart = vi.mocked(calculateBookingCart);
const mockPlaceBookingOrder = vi.mocked(placeBookingOrder);
const mockCreateBookingRedirectSession = vi.mocked(createBookingRedirectSession);
const mockGetBookingServiceById = vi.mocked(getBookingServiceById);
const mockListAvailabilityTimeSlots = vi.mocked(listAvailabilityTimeSlots);

const mockClient = {} as Parameters<typeof provideWixBookingsService>[0];
const config = {
    bookingAppId: 'booking-app-1',
    staffResourceTypeId: 'staff-type-1',
    slotWindowDays: 14,
    postCheckoutUrl: '/book',
};

const bookingInput = {
    serviceId: 'svc-1',
    serviceType: 'APPOINTMENT' as const,
    slot: {
        localStartDate: '2026-08-20T10:00:00',
        localEndDate: '2026-08-20T10:30:00',
        scheduleId: 'sched-1',
    },
    formValues: { email: 'user@example.com' },
    timezone: 'Asia/Jerusalem',
    siteOrigin: 'http://localhost:3000',
};

describe('WixBookingsService.createBooking', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetBookingServiceById.mockResolvedValue({
            payment: { options: { online: true, inPerson: false } },
        });
        mockCreateBookingRecord.mockResolvedValue({ booking: { id: 'booking-1' } });
        mockCreateBookingCart.mockResolvedValue({ cart: { id: 'cart-1' } });
    });

    it('should place a free order when cart total is zero', async () => {
        mockCalculateBookingCart.mockResolvedValue({
            summary: { priceSummary: { total: { amount: '0' } } },
        });
        const service = provideWixBookingsService(mockClient, config);

        await expect(service.createBooking(bookingInput)).resolves.toEqual({
            outcome: 'confirmed',
        });
        expect(mockPlaceBookingOrder).toHaveBeenCalledWith(mockClient, 'cart-1');
        expect(mockCreateBookingRedirectSession).not.toHaveBeenCalled();
    });

    it('should return a redirect URL when cart total is greater than zero', async () => {
        mockCalculateBookingCart.mockResolvedValue({
            summary: { priceSummary: { total: { amount: '50.00' } } },
        });
        mockCreateBookingRedirectSession.mockResolvedValue({
            redirectSession: { fullUrl: 'https://checkout.wix.com/session-1' },
        });
        const service = provideWixBookingsService(mockClient, config);

        await expect(service.createBooking(bookingInput)).resolves.toEqual({
            outcome: 'redirect',
            redirectUrl: 'https://checkout.wix.com/session-1',
        });
        expect(mockCreateBookingRedirectSession).toHaveBeenCalledWith(
            mockClient,
            'cart-1',
            'http://localhost:3000/book',
        );
        expect(mockPlaceBookingOrder).not.toHaveBeenCalled();
    });
});

describe('WixBookingsService.listSlots', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should query availability using the client timezone for local date bounds', async () => {
        const fixedNow = new Date('2026-08-25T22:30:00.000Z');
        vi.useFakeTimers();
        vi.setSystemTime(fixedNow);

        mockListAvailabilityTimeSlots.mockResolvedValueOnce([]);
        const service = provideWixBookingsService(mockClient, config);

        await service.listSlots({
            serviceId: 'svc-1',
            serviceType: 'APPOINTMENT',
            timezone: 'Asia/Jerusalem',
        });

        expect(mockListAvailabilityTimeSlots).toHaveBeenCalledWith(
            mockClient,
            {
                serviceId: 'svc-1',
                fromLocalDate: '2026-08-26T01:30:00',
                toLocalDate: '2026-09-09T01:30:00',
                timeZone: 'Asia/Jerusalem',
            },
            { maxSlots: 200 },
        );

        vi.useRealTimers();
    });
});
