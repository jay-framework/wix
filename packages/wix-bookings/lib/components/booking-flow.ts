import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, Props } from '@jay-framework/component';
import {
    BookingFailure,
    ServicesFailure,
    SlotsFailure,
    type BookingFlowContract,
    type BookingFlowFastViewState,
    type BookingFlowRefs,
    type BookingFlowSlowViewState,
    type FormFieldOfBookingFlowViewState,
    type ServiceOfBookingFlowViewState,
    type SlotOfBookingFlowViewState,
} from '../contracts/booking-flow.jay-contract';
import {
    WIX_BOOKINGS_SERVICE,
    type WixBookingsService,
} from '../services/wix-bookings-service-marker.js';
import type {
    BookingFormFieldView,
    BookingServiceType,
    BookingServiceView,
    BookingSlotView,
    CreateBookingOutcome,
    ParticipantFormValue,
} from '../types.js';
import { createBooking, getParticipantForm, listSlots } from '../actions/bookings-actions.js';
import { blockingFieldLabels, participantFieldErrors } from '../utils/participant-form.js';
import {
    SLOW_RENDER_TTL,
    SLOW_RENDER_GRACE,
    SLOW_RENDER_ERROR_TTL,
} from '../slow-render-defaults.js';
import {
    bookingStateOf,
    describeBookingError,
    describeServicesError,
    describeUnsupportedForm,
} from '../utils/booking-outcome.js';

interface BookingFlowCarryForward {
    services: BookingServiceView[];
    servicesError?: string;
    servicesFailure?: ServicesFailure;
}

function toBookingService(service: ServiceOfBookingFlowViewState): BookingServiceView {
    return {
        ...service,
        type: service.type as BookingServiceType,
    };
}

function toContractFormField(field: BookingFormFieldView): FormFieldOfBookingFlowViewState {
    return { target: field.target, label: field.label, type: field.type, required: field.required };
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
            { ttl: SLOW_RENDER_TTL, grace: SLOW_RENDER_GRACE },
        );
    } catch (error) {
        const { failure, message } = describeServicesError(error);
        console.error('[booking-flow] listServices failed:', error);
        return phaseOutput<BookingFlowSlowViewState, BookingFlowCarryForward>(
            { services: [] },
            { services: [], servicesError: message, servicesFailure: failure },
            { ttl: SLOW_RENDER_ERROR_TTL },
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
            servicesFailure: carryForward.servicesFailure ?? ServicesFailure.NONE,
            showNoServices: carryForward.services.length === 0 && !carryForward.servicesError,
            hasSlots: false,
            showServices: true,
            showSlots: false,
            showForm: false,
            selectedServiceName: '',
            slots: [],
            slotsLoading: false,
            slotsMessage: '',
            slotsFailure: SlotsFailure.NONE,
            formFields: [],
            formLoading: false,
            isBooking: false,
            bookingStatus: '',
            bookingError: '',
            bookingState: bookingStateOf({
                isBooking: false,
                isConfirmed: false,
                failure: BookingFailure.NONE,
            }),
            bookingFailure: BookingFailure.NONE,
        },
        carryForward,
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
    const showNoServices = _carryForward.services.length === 0 && !_carryForward.servicesError;
    const servicesError = _carryForward.servicesError ?? '';
    const servicesFailure = _carryForward.servicesFailure ?? ServicesFailure.NONE;
    const [hasSlots, setHasSlots] = createSignal(false);
    const [showSlots, setShowSlots] = createSignal(false);
    const [showForm, setShowForm] = createSignal(false);
    const [selectedService, setSelectedService] = createSignal<BookingServiceView | null>(null);
    const [selectedSlot, setSelectedSlot] = createSignal<BookingSlotView | null>(null);
    const [selectedServiceName, setSelectedServiceName] = createSignal('');
    const [slots, setSlots] = createSignal<BookingSlotView[]>([]);
    const [slotsLoading, setSlotsLoading] = createSignal(false);
    const [slotsMessage, setSlotsMessage] = createSignal('');
    const [slotsFailure, setSlotsFailure] = createSignal(SlotsFailure.NONE);
    const [formFields, setFormFields] = createSignal<BookingFormFieldView[]>([]);
    const [formLoading, setFormLoading] = createSignal(false);
    const [isBooking, setIsBooking] = createSignal(false);
    const [bookingStatus, setBookingStatus] = createSignal('');
    const [bookingError, setBookingError] = createSignal('');
    const [bookingFailure, setBookingFailure] = createSignal(BookingFailure.NONE);
    const [isConfirmed, setIsConfirmed] = createSignal(false);

    function resetBookingMessages() {
        setBookingStatus('');
        setBookingError('');
        setBookingFailure(BookingFailure.NONE);
        setIsConfirmed(false);
    }

    function failBooking(failure: BookingFailure, message: string) {
        setBookingFailure(failure);
        setBookingError(message);
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
        setSlotsFailure(SlotsFailure.NONE);
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
            setSlotsFailure(SlotsFailure.UNKNOWN);
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
            const participantForm = await getParticipantForm({ serviceId: service.id });
            const blocking = blockingFieldLabels(participantForm);
            if (blocking.length) {
                failBooking(BookingFailure.FORM_UNSUPPORTED, describeUnsupportedForm(blocking));
                setShowForm(false);
                return;
            }
            setFormFields(participantForm.fields);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Could not load participant form fields.';
            failBooking(BookingFailure.FORM_UNAVAILABLE, message);
            setShowForm(false);
        } finally {
            setFormLoading(false);
        }
    }

    async function readFormValues(): Promise<Record<string, ParticipantFormValue>> {
        const formValues: Record<string, ParticipantFormValue> = {};
        const reads =
            refs.formFields?.formInputs?.map((input, field) =>
                input.exec$((element) => ({
                    target: field.target,
                    value:
                        field.type === 'BOOLEAN'
                            ? (element as HTMLInputElement).checked
                            : (element as HTMLInputElement).value,
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

        resetBookingMessages();

        const formValues = await readFormValues();
        const [validationError] = Object.values(participantFieldErrors(formFields(), formValues));
        if (validationError) {
            failBooking(BookingFailure.VALIDATION, validationError);
            return;
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

            showBookingOutcome(result);
        } catch (error) {
            const { failure, message } = describeBookingError(error);
            failBooking(failure, message);
        } finally {
            setIsBooking(false);
        }
    }

    function showBookingOutcome(result: CreateBookingOutcome) {
        switch (result.outcome) {
            case 'redirect':
                window.location.href = result.redirectUrl;
                return;
            case 'confirmed':
                setBookingStatus('Booking confirmed!');
                setIsConfirmed(true);
                setShowForm(false);
                setSelectedSlot(null);
                return;
            case 'invalid':
                failBooking(BookingFailure.VALIDATION, firstFieldError(result.fieldErrors));
                return;
            case 'formUnavailable':
                failBooking(BookingFailure[result.failure], result.message);
                setShowForm(false);
                return;
            default: {
                const unhandled: never = result;
                throw new Error(`Unknown booking outcome: ${JSON.stringify(unhandled)}`);
            }
        }
    }

    /** The message of the first rendered field with an error; any message when none is rendered. */
    function firstFieldError(fieldErrors: Record<string, string>): string {
        const rendered = formFields().find((field) => fieldErrors[field.target]);
        return rendered ? fieldErrors[rendered.target] : (Object.values(fieldErrors)[0] ?? '');
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
        setSlotsFailure(SlotsFailure.NONE);
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
            servicesFailure,
            showServices: showServices(),
            showNoServices,
            showSlots: showSlots(),
            showForm: showForm(),
            selectedServiceName: selectedServiceName(),
            slots: slots().map(toContractSlot),
            slotsLoading: slotsLoading(),
            slotsMessage: slotsMessage(),
            slotsFailure: slotsFailure(),
            hasSlots: hasSlots(),
            formFields: formFields().map(toContractFormField),
            formLoading: formLoading(),
            isBooking: isBooking(),
            bookingStatus: bookingStatus(),
            bookingError: bookingError(),
            bookingState: bookingStateOf({
                isBooking: isBooking(),
                isConfirmed: isConfirmed(),
                failure: bookingFailure(),
            }),
            bookingFailure: bookingFailure(),
        }),
    };
}

export const bookingFlow = makeJayStackComponent<BookingFlowContract>()
    .withProps()
    .withServices(WIX_BOOKINGS_SERVICE)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(BookingFlowInteractive);
