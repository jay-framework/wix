import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, Props } from '@jay-framework/component';
import type {
    BookingFlowContract,
    BookingFlowFastViewState,
    BookingFlowRefs,
    BookingFlowSlowViewState,
    ServiceOfBookingFlowViewState,
    SlotOfBookingFlowViewState,
} from '../contracts/booking-flow.jay-contract.js';
import {
    WIX_BOOKINGS_SERVICE,
    type WixBookingsService,
} from '../services/wix-bookings-service-marker.js';
import type {
    BookingFormFieldView,
    BookingServiceType,
    BookingServiceView,
    BookingSlotView,
} from '../types.js';
import { createBooking, listSlots } from '../actions/bookings-actions.js';
import { getFormSummary, validateFormSummaryField } from '@jay-framework/wix-forms';

const DEFAULT_PARTICIPANT_FIELDS: BookingFormFieldView[] = [
    { target: 'first_name', label: 'First Name', type: 'STRING', required: true },
    { target: 'last_name', label: 'Last Name', type: 'STRING', required: true },
    { target: 'email', label: 'Email', type: 'EMAIL', required: true },
];

interface BookingFlowCarryForward {
    services: BookingServiceView[];
    servicesError?: string;
}

function toBookingService(service: ServiceOfBookingFlowViewState): BookingServiceView {
    return {
        ...service,
        type: service.type as BookingServiceType,
    };
}

function toContractSlot(slot: BookingSlotView): SlotOfBookingFlowViewState {
    return {
        id: slot.id,
        label: slot.label,
        localStartDate: slot.localStartDate,
        localEndDate: slot.localEndDate,
        scheduleId: slot.scheduleId ?? '',
        eventId: slot.eventId ?? '',
    };
}

async function renderSlowlyChanging(_props: object, bookings: WixBookingsService) {
    try {
        const services = await bookings.listServices();
        return phaseOutput<BookingFlowSlowViewState, BookingFlowCarryForward>(
            { services },
            { services },
        );
    } catch (error) {
        const rawMessage =
            error instanceof Error ? error.message : 'Could not load booking services.';
        const message = rawMessage.includes('403')
            ? 'Bookings API access denied. Add Wix Bookings permission to your API key in the Wix dashboard.'
            : rawMessage || 'Could not load booking services.';
        console.error('[booking-flow] listServices failed:', error);
        return phaseOutput<BookingFlowSlowViewState, BookingFlowCarryForward>(
            { services: [] },
            { services: [], servicesError: message },
        );
    }
}

async function renderFastChanging(_props: object, carryForward: BookingFlowCarryForward) {
    const Pipeline = RenderPipeline.for<BookingFlowFastViewState, BookingFlowCarryForward>();
    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            services: carryForward.services,
            servicesLoading: false,
            servicesError: carryForward.servicesError ?? '',
            showNoServices:
                carryForward.services.length === 0 && !carryForward.servicesError,
            hasSlots: false,
            showServices: true,
            showSlots: false,
            showForm: false,
            selectedServiceName: '',
            slots: [],
            slotsLoading: false,
            slotsMessage: '',
            formFields: [],
            formLoading: false,
            isBooking: false,
            bookingStatus: '',
            bookingError: '',
        },
        carryForward: {
            services: carryForward.services,
            servicesError: carryForward.servicesError,
        },
    }));
}

function BookingFlowInteractive(
    _props: Props<object>,
    refs: BookingFlowRefs,
    viewStateSignals: Signals<BookingFlowFastViewState>,
    _carryForward: BookingFlowCarryForward,
) {
    const [services] = viewStateSignals.services;
    const [showServices, setShowServices] = createSignal(true);
    const showNoServices =
        _carryForward.services.length === 0 && !_carryForward.servicesError;
    const servicesError = _carryForward.servicesError ?? '';
    const [hasSlots, setHasSlots] = createSignal(false);
    const [showSlots, setShowSlots] = createSignal(false);
    const [showForm, setShowForm] = createSignal(false);
    const [selectedService, setSelectedService] = createSignal<BookingServiceView | null>(null);
    const [selectedSlot, setSelectedSlot] = createSignal<BookingSlotView | null>(null);
    const [selectedServiceName, setSelectedServiceName] = createSignal('');
    const [slots, setSlots] = createSignal<BookingSlotView[]>([]);
    const [slotsLoading, setSlotsLoading] = createSignal(false);
    const [slotsMessage, setSlotsMessage] = createSignal('');
    const [formFields, setFormFields] = createSignal<BookingFormFieldView[]>([]);
    const [formLoading, setFormLoading] = createSignal(false);
    const [isBooking, setIsBooking] = createSignal(false);
    const [bookingStatus, setBookingStatus] = createSignal('');
    const [bookingError, setBookingError] = createSignal('');

    function resetBookingMessages() {
        setBookingStatus('');
        setBookingError('');
    }

    async function onSelectService(service: BookingServiceView) {
        resetBookingMessages();
        setSelectedService(service);
        setSelectedServiceName(service.name);
        setSelectedSlot(null);
        setShowServices(false);
        setShowSlots(true);
        setShowForm(false);
        setSlotsLoading(true);
        setSlotsMessage('');
        setSlots([]);
        setHasSlots(false);

        try {
            const result = await listSlots({
                serviceId: service.id,
                serviceType: service.type,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
            if (!result.slots.length) {
                setSlotsMessage('No available times in the next 14 days.');
            }
            setSlots(result.slots);
            setHasSlots(result.slots.length > 0);
        } catch (error) {
            setSlotsMessage(
                error instanceof Error ? error.message : 'Could not load availability.',
            );
        } finally {
            setSlotsLoading(false);
        }
    }

    async function onSelectSlot(slot: BookingSlotView) {
        const service = selectedService();
        if (!service) {
            return;
        }

        resetBookingMessages();
        setSelectedSlot(slot);
        setShowForm(true);
        setFormLoading(true);
        setFormFields([]);

        try {
            if (!service.formId) {
                setFormFields(DEFAULT_PARTICIPANT_FIELDS);
                return;
            }

            const result = await getFormSummary({ formId: service.formId });
            setFormFields(
                result.fields.map((field) => ({
                    target: field.target,
                    label: field.label,
                    type: field.type,
                    required: field.required,
                })),
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Could not load participant form fields.';
            setBookingError(message);
            setShowForm(false);
        } finally {
            setFormLoading(false);
        }
    }

    async function readFormValues(): Promise<Record<string, string>> {
        const formValues: Record<string, string> = {};
        const reads =
            refs.formFields?.formInputs?.map((input, field) =>
                input.exec$((element) => ({
                    target: field.target,
                    value: (element as HTMLInputElement).value,
                })),
            ) ?? [];
        const resolved = await Promise.all(reads);
        for (const entry of resolved) {
            formValues[entry.target] = entry.value;
        }
        return formValues;
    }

    async function onConfirmBooking() {
        const service = selectedService();
        const slot = selectedSlot();
        if (!service || !slot) {
            return;
        }

        setBookingError('');
        setBookingStatus('');

        const formValues = await readFormValues();
        const fields = formFields();
        for (const field of fields) {
            const validationError = validateFormSummaryField(field, formValues[field.target] ?? '');
            if (validationError) {
                setBookingError(validationError);
                return;
            }
        }

        setIsBooking(true);

        try {
            const result = await createBooking({
                serviceId: service.id,
                serviceType: service.type,
                slot: {
                    localStartDate: slot.localStartDate,
                    localEndDate: slot.localEndDate,
                    scheduleId: slot.scheduleId,
                    eventId: slot.eventId,
                },
                formValues,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                siteOrigin: window.location.origin,
            });

            if (result.outcome === 'redirect') {
                window.location.href = result.redirectUrl;
                return;
            }

            setBookingStatus('Booking confirmed!');
            setShowForm(false);
            setSelectedSlot(null);
        } catch (error) {
            const rawMessage =
                error instanceof Error ? error.message : 'Booking failed. Please try again.';
            let message = rawMessage;
            if (rawMessage.includes('/ecom/v2/carts') && rawMessage.includes('403')) {
                message =
                    'Checkout API access denied. Add Wix eCommerce (carts/checkout) permission to your API key in the Wix dashboard.';
            } else if (rawMessage.includes('redirect-session') && rawMessage.includes('400')) {
                message =
                    'Checkout redirect rejected. In Wix Dashboard → Headless Settings → your client → Allowed redirect domains, add localhost:3000 for local dev (or your deployed domain).';
            } else if (rawMessage.includes('get-checkout-url')) {
                message =
                    'Could not open Wix checkout. Publish your Wix site (hosted checkout requires a published site).';
            }
            setBookingError(message);
        } finally {
            setIsBooking(false);
        }
    }

    function onBackToServices() {
        resetBookingMessages();
        setShowServices(true);
        setShowSlots(false);
        setShowForm(false);
        setSelectedService(null);
        setSelectedSlot(null);
        setSelectedServiceName('');
        setSlots([]);
        setSlotsMessage('');
        setHasSlots(false);
        setFormFields([]);
    }

    refs.services?.serviceButtons?.onclick(({ coordinate }) => {
        const serviceId = coordinate[0] as string;
        const service = services().find((entry) => entry.id === serviceId);
        if (service) {
            void onSelectService(toBookingService(service));
        }
    });

    refs.slots?.slotButtons?.onclick(({ coordinate }) => {
        const slotId = coordinate[0] as string;
        const slot = slots().find((entry) => entry.id === slotId);
        if (slot) {
            void onSelectSlot(slot);
        }
    });

    refs.bookButton?.onclick(() => {
        void onConfirmBooking();
    });

    refs.backButton?.onclick(() => {
        onBackToServices();
    });

    return {
        render: () => ({
            services: services(),
            servicesLoading: false,
            servicesError,
            showServices: showServices(),
            showNoServices,
            showSlots: showSlots(),
            showForm: showForm(),
            selectedServiceName: selectedServiceName(),
            slots: slots().map(toContractSlot),
            slotsLoading: slotsLoading(),
            slotsMessage: slotsMessage(),
            hasSlots: hasSlots(),
            formFields: formFields(),
            formLoading: formLoading(),
            isBooking: isBooking(),
            bookingStatus: bookingStatus(),
            bookingError: bookingError(),
        }),
    };
}

export const bookingFlow = makeJayStackComponent<BookingFlowContract>()
    .withProps()
    .withServices(WIX_BOOKINGS_SERVICE)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(BookingFlowInteractive);
