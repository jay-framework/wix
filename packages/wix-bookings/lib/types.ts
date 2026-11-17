import type { PhoneRules } from '@jay-framework/wix-forms';

export type BookingServiceType = 'APPOINTMENT' | 'CLASS';

export interface BookingServiceView {
    id: string;
    name: string;
    type: BookingServiceType;
    description: string;
    priceLabel: string;
    durationLabel: string;
    formId: string;
}

export interface BookingSlotView {
    id: string;
    localStartDate: string;
    localEndDate: string;
    label: string;
    scheduleId?: string;
    eventId?: string;
    serviceType: BookingServiceType;
}

export interface BookingFormFieldView {
    target: string;
    label: string;
    type: 'STRING' | 'EMAIL' | 'PHONE' | 'NUMBER' | 'URL';
    required: boolean;
    /** PHONE fields: the rules `checkPhone` uses to judge and normalize the value (DL #58). */
    phone?: PhoneRules;
}

export type CreateBookingOutcome =
    /** Booked with nothing to pay: `orderId` is the placed order (Wix's thank-you page is /thank-you-page/<orderId>). */
    { outcome: 'confirmed'; orderId?: string } | { outcome: 'redirect'; redirectUrl: string };
