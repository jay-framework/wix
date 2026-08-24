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
}

export type CreateBookingOutcome =
    | { outcome: 'confirmed' }
    | { outcome: 'redirect'; redirectUrl: string };
