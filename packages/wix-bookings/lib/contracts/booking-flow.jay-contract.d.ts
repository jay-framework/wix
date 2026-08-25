import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface ServiceOfBookingFlowViewState {
  id: string,
  name: string,
  description: string,
  type: string,
  durationLabel: string,
  priceLabel: string,
  formId: string
}

export interface SlotOfBookingFlowViewState {
  id: string,
  label: string,
  localStartDate: string,
  localEndDate: string,
  scheduleId: string,
  eventId: string
}

export interface FormFieldOfBookingFlowViewState {
  target: string,
  label: string,
  type: string,
  required: boolean
}

export interface BookingFlowViewState {
  services: Array<ServiceOfBookingFlowViewState>,
  servicesLoading: boolean,
  showNoServices: boolean,
  hasSlots: boolean,
  servicesError: string,
  showServices: boolean,
  showSlots: boolean,
  showForm: boolean,
  selectedServiceName: string,
  slots: Array<SlotOfBookingFlowViewState>,
  slotsLoading: boolean,
  slotsMessage: string,
  formFields: Array<FormFieldOfBookingFlowViewState>,
  formLoading: boolean,
  isBooking: boolean,
  bookingStatus: string,
  bookingError: string
}

export type BookingFlowSlowViewState = {};

export type BookingFlowFastViewState = Pick<BookingFlowViewState, 'servicesLoading' | 'showNoServices' | 'hasSlots' | 'servicesError' | 'showServices' | 'showSlots' | 'showForm' | 'selectedServiceName' | 'slotsLoading' | 'slotsMessage' | 'formLoading' | 'isBooking' | 'bookingStatus' | 'bookingError'> & {
    services: Array<BookingFlowViewState['services'][number]>;
    slots: Array<BookingFlowViewState['slots'][number]>;
    formFields: Array<BookingFlowViewState['formFields'][number]>;
};

export type BookingFlowInteractiveViewState = Pick<BookingFlowViewState, 'servicesLoading' | 'showNoServices' | 'hasSlots' | 'servicesError' | 'showServices' | 'showSlots' | 'showForm' | 'selectedServiceName' | 'slotsLoading' | 'slotsMessage' | 'formLoading' | 'isBooking' | 'bookingStatus' | 'bookingError'> & {
    services: Array<BookingFlowViewState['services'][number]>;
    slots: Array<BookingFlowViewState['slots'][number]>;
    formFields: Array<BookingFlowViewState['formFields'][number]>;
};


export interface BookingFlowRefs {
  bookButton: HTMLElementProxy<BookingFlowViewState, HTMLButtonElement>,
  backButton: HTMLElementProxy<BookingFlowViewState, HTMLButtonElement>,
  services: {
    serviceButtons: HTMLElementCollectionProxy<ServiceOfBookingFlowViewState, HTMLButtonElement>
  },
  slots: {
    slotButtons: HTMLElementCollectionProxy<SlotOfBookingFlowViewState, HTMLButtonElement>
  },
  formFields: {
    formInputs: HTMLElementCollectionProxy<FormFieldOfBookingFlowViewState, HTMLInputElement>
  }
}


export interface BookingFlowRepeatedRefs {
  bookButton: HTMLElementCollectionProxy<BookingFlowViewState, HTMLButtonElement>,
  backButton: HTMLElementCollectionProxy<BookingFlowViewState, HTMLButtonElement>,
  services: {
    serviceButtons: HTMLElementCollectionProxy<ServiceOfBookingFlowViewState, HTMLButtonElement>
  },
  slots: {
    slotButtons: HTMLElementCollectionProxy<SlotOfBookingFlowViewState, HTMLButtonElement>
  },
  formFields: {
    formInputs: HTMLElementCollectionProxy<FormFieldOfBookingFlowViewState, HTMLInputElement>
  }
}

export type BookingFlowContract = JayContract<BookingFlowViewState, BookingFlowRefs, BookingFlowSlowViewState, BookingFlowFastViewState, BookingFlowInteractiveViewState>