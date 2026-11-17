import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, Props, useReactive } from '@jay-framework/component';
import {
    BookingFailure,
    ServicesFailure,
    SlotsFailure,
    type BookingFlowContract,
    type BookingFlowFastViewState,
    type AddressOfBookingFlowViewState,
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
import {
    blockingFieldLabels,
    normalisedAddress,
    participantFieldErrors,
    postedParticipantValues,
    toFormFieldView,
} from '../utils/participant-form.js';
import {
    ADDRESS_PARTS,
    addressViewState,
    fieldErrorsOf,
    initialAddressValue,
    nextAddressValue,
    splitErrorKey,
    withLearnedFacts,
    type AddressPart,
    type AddressValue,
} from '@jay-framework/wix-forms';
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
    FORM_UNAVAILABLE_MESSAGE,
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

/** No address field (DL #52 §2): every part hidden, nothing to choose. */
function absentAddressViewState(): AddressOfBookingFlowViewState {
    const part = {
        shown: false,
        required: false,
        order: 0,
        label: '',
        value: '',
        error: '',
        invalid: false,
    };
    return {
        present: false,
        label: '',
        required: false,
        error: '',
        invalid: false,
        country: { label: '', value: '', error: '', invalid: false, options: [] },
        addressLine: { ...part, maxLength: 0 },
        addressLine2: { ...part, maxLength: 0 },
        streetName: { ...part, maxLength: 0 },
        streetNumber: { ...part, maxLength: 0 },
        city: { ...part, maxLength: 0 },
        subdivision: { ...part, listed: false, options: [] },
        postalCode: { ...part, maxLength: 0 },
    } as AddressOfBookingFlowViewState;
}

function toAddressViewState(
    field: BookingFormFieldView | null,
    value: AddressValue,
    errors: Record<string, string>,
): AddressOfBookingFlowViewState {
    if (!field?.address) return absentAddressViewState();
    return {
        present: true,
        ...addressViewState(toFormFieldView(field), value, errors),
    } as unknown as AddressOfBookingFlowViewState;
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
            address: absentAddressViewState(),
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
    // The address (DL #52 §3): `addressField().address` is the one spec every consumer reads.
    const [addressField, setAddressField] = createSignal<BookingFormFieldView | null>(null);
    const [addressValue, setAddressValue] = createSignal<AddressValue>({});
    const [addressErrors, setAddressErrors] = createSignal<Record<string, string>>({});

    const reactive = useReactive();

    /** The initial country is shown once the new options are rendered (a select needs them). */
    function resetAddress(field: BookingFormFieldView | null) {
        const initial = field?.address ? initialAddressValue(field.address) : {};
        setAddressField(field);
        setAddressValue(initial);
        setAddressErrors({});
        void reactive.toBeClean().then(() => reflectAddressInputs(initial));
    }

    function onAddressInput(part: AddressPart, value: string) {
        const field = addressField();
        if (!field?.address) return;
        const next = nextAddressValue(field.address, addressValue(), part, value);
        setAddressValue(next);
        if (part === 'country') reflectAddressInputs(next);
        const key = `${field.target}/${part}`;
        if (addressErrors()[key] && !addressErrorsNow()[key]) clearAddressError(key);
    }

    /** "Late to complain": blur shows the part's current error, if any. */
    function onAddressBlur(part: AddressPart) {
        const field = addressField();
        if (!field) return;
        const key = `${field.target}/${part}`;
        const message = addressErrorsNow()[key] ?? '';
        setAddressErrors((current) => ({ ...current, [key]: message }));
    }

    function addressErrorsNow(): Record<string, string> {
        const field = addressField();
        return field ? fieldErrorsOf(toFormFieldView(field), addressValue()) : {};
    }

    function clearAddressError(key: string) {
        setAddressErrors((current) => ({ ...current, [key]: '' }));
    }

    /** Native inputs keep their DOM text: show what the store now holds. */
    function reflectAddressInputs(value: AddressValue) {
        const addressRefs = refs.address as Record<string, any> | undefined;
        for (const part of ADDRESS_PARTS) {
            for (const channel of ['input', 'text']) {
                void addressRefs?.[part]?.[channel]?.exec$?.((element: HTMLInputElement) => {
                    element.value = value[part] ?? '';
                });
            }
        }
    }

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
        resetAddress(null);

        try {
            const participantForm = await getParticipantForm({ serviceId: service.id });
            const blocking = blockingFieldLabels(participantForm);
            if (blocking.length) {
                failBooking(BookingFailure.FORM_UNSUPPORTED, describeUnsupportedForm(blocking));
                setShowForm(false);
                return;
            }
            const fields = participantForm.fields as BookingFormFieldView[];
            setFormFields(fields.filter((field) => field.type !== 'ADDRESS'));
            resetAddress(fields.find((field) => field.type === 'ADDRESS') ?? null);
        } catch (error) {
            console.warn('[wix-bookings] participant form could not load:', error);
            failBooking(BookingFailure.FORM_UNAVAILABLE, FORM_UNAVAILABLE_MESSAGE);
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
        const field = addressField();
        const address = field ? normalisedAddress(field, addressValue()) : undefined;
        if (field && address) formValues[field.target] = address;
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
        const partErrors = addressErrorsNow();
        setAddressErrors(partErrors);
        const [validationError] = [
            ...Object.values(participantFieldErrors(formFields(), formValues)),
            ...Object.values(partErrors),
        ];
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
                formValues: postedParticipantValues(formFields(), formValues),
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
                showAddressRejection(result);
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

    /**
     * Part errors go to the address; learned facts replace the spec through `withLearnedFacts`,
     * keyed by the country the server says it learned them for (review m7), so a country changed
     * while the request was in flight cannot receive them. A learned list clears the stale code.
     */
    function showAddressRejection(result: Extract<CreateBookingOutcome, { outcome: 'invalid' }>) {
        const field = addressField();
        if (!field?.address) return;
        const partErrors = Object.fromEntries(
            Object.entries(result.fieldErrors).filter(
                ([key]) => splitErrorKey(key).target === field.target && key !== field.target,
            ),
        );
        setAddressErrors(partErrors);
        const country = result.factsCountry?.[field.target];
        const listKey = `${field.target}/subdivision`;
        const options = result.fieldOptions?.[listKey];
        const revealed = result.revealedParts?.[field.target];
        if (!country || (!options && !revealed)) return;
        setAddressField({
            ...field,
            address: withLearnedFacts(field.address, {
                ...(options ? { subdivisionsOf: { [country]: options } } : {}),
                ...(revealed ? { revealedPartsOf: { [country]: revealed } } : {}),
            }),
        });
        if (options && addressValue().country === country) {
            setAddressValue({ ...addressValue(), subdivision: '' });
            reflectAddressInputs(addressValue());
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
        setSlotsFailure(SlotsFailure.NONE);
        setHasSlots(false);
        setFormFields([]);
        resetAddress(null);
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

    for (const part of ADDRESS_PARTS) {
        const partRefs = (refs.address as Record<string, any> | undefined)?.[part];
        for (const channel of ['input', 'text']) {
            const ref = partRefs?.[channel];
            const read = ({ event }: { event: Event }) =>
                onAddressInput(part, (event.target as HTMLInputElement).value ?? '');
            ref?.oninput?.(read);
            ref?.onchange?.(read);
            ref?.onblur?.(() => onAddressBlur(part));
        }
    }

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
            address: toAddressViewState(addressField(), addressValue(), addressErrors()),
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
