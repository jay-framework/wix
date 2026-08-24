import { createJayService } from '@jay-framework/fullstack-component';
import type { BookingServiceView, BookingSlotView, CreateBookingOutcome, BookingServiceType } from '../types.js';

export interface WixBookingsService {
    listServices(): Promise<BookingServiceView[]>;
    listSlots(input: {
        serviceId: string;
        serviceType: BookingServiceType;
        timezone?: string;
        windowDays?: number;
    }): Promise<BookingSlotView[]>;
    createBooking(input: {
        serviceId: string;
        serviceType: BookingServiceType;
        slot: {
            localStartDate: string;
            localEndDate: string;
            scheduleId?: string;
            eventId?: string;
        };
        formValues: Record<string, string>;
        timezone: string;
        siteOrigin: string;
        paymentPreference?: 'ONLINE' | 'OFFLINE';
    }): Promise<CreateBookingOutcome>;
}

export const WIX_BOOKINGS_SERVICE = createJayService<WixBookingsService>('WixBookingsService');
