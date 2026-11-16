import type {
    AddressValue,
    FieldViewData,
    FormFieldOptionView,
    LayoutPart,
    PhoneRules,
} from '@jay-framework/wix-forms';

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

/** A participant field bookings can render (DL #51 §3): its type plus Get Form's view data. */
export type BookingFormFieldView = {
    target: string;
    label: string;
    type: 'STRING' | 'EMAIL' | 'PHONE' | 'URL' | 'BOOLEAN' | 'ADDRESS';
    required: boolean;
    /** PHONE fields: the rules `checkPhone` uses to judge and normalize the value (DL #58). */
    phone?: PhoneRules;
    /** A long-text (`TEXT_AREA`) field, validated as a textarea. */
    longText: boolean;
} & FieldViewData;

/** A participant value: a string, a boolean for a single checkbox, or an address (DL #52). */
export type ParticipantFormValue = string | boolean | AddressValue;

/** The `createBooking` action input. */
export interface CreateBookingInput {
    serviceId: string;
    serviceType: BookingServiceType;
    slot: {
        localStartDate: string;
        localEndDate: string;
        scheduleId?: string;
        eventId?: string;
    };
    formValues: Record<string, ParticipantFormValue>;
    timezone: string;
    siteOrigin: string;
    paymentPreference?: 'ONLINE' | 'OFFLINE';
}

export type CreateBookingOutcome =
    /** Booked with nothing to pay: `orderId` is the placed order (Wix's thank-you page is /thank-you-page/<orderId>). */
    | { outcome: 'confirmed'; orderId?: string }
    | { outcome: 'redirect'; redirectUrl: string }
    /**
     * Server validation failed (DL #51 §4): key = field target, or `<target>/<part>` for an address
     * part (DL #52); value = the message; ≥1 entry.
     */
    | {
          outcome: 'invalid';
          fieldErrors: Record<string, string>;
          /** `<target>/subdivision` → the codes Wix accepts, learned from this 400 (DL #52 Q6). */
          fieldOptions?: Record<string, FormFieldOptionView[]>;
          /** target → parts Wix required that the layout hid (DL #52 Q17). */
          revealedParts?: Record<string, LayoutPart[]>;
          /** target → the submitted country the learned facts belong to. */
          factsCountry?: Record<string, string>;
      }
    /** The participant form cannot be booked: never retry FORM_UNSUPPORTED (DL #51 §4). */
    | {
          outcome: 'formUnavailable';
          failure: 'FORM_UNSUPPORTED' | 'FORM_UNAVAILABLE';
          message: string;
      };
