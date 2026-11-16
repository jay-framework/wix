import { createJayService } from '@jay-framework/fullstack-component';
import type { ProjectedForm, WixFormsService } from '@jay-framework/wix-forms';
import type {
    BookingFormFieldView,
    BookingServiceView,
    BookingSlotView,
    CreateBookingInput,
    CreateBookingOutcome,
    BookingServiceType,
} from '../types.js';

export interface WixBookingsService {
    listServices(): Promise<BookingServiceView[]>;
    listSlots(input: {
        serviceId: string;
        serviceType: BookingServiceType;
        timezone?: string;
        windowDays?: number;
    }): Promise<BookingSlotView[]>;
    /**
     * The service's participant form from Get Form (DL #51 §3), in layout order, with the fields
     * bookings cannot show. Throws for a missing service or form, an invalid form id, or a Wix failure.
     */
    getParticipantForm(
        serviceId: string,
        forms: WixFormsService,
    ): Promise<ProjectedForm<BookingFormFieldView>>;
    /**
     * Re-validates the participant values against Get Form (DL #51 §4), then books and checks
     * out. Form problems are returned as `invalid` / `formUnavailable`, never thrown.
     */
    createBooking(input: CreateBookingInput, forms: WixFormsService): Promise<CreateBookingOutcome>;
}

export const WIX_BOOKINGS_SERVICE = createJayService<WixBookingsService>('WixBookingsService');
