import type { BookingServiceView, BookingSlotView, BookingServiceType } from '../types.js';

interface WixPrice {
    currency?: string;
    value?: string;
}

interface RawService {
    _id?: string;
    id?: string;
    name?: string;
    type?: BookingServiceType;
    description?: string;
    hidden?: boolean;
    payment?: {
        fixed?: { price?: WixPrice };
        options?: { online?: boolean; inPerson?: boolean };
    };
    schedule?: {
        availabilityConstraints?: { sessionDurations?: number[] };
    };
    form?: { _id?: string };
}

export function formatPrice(service: RawService): string {
    const price = service.payment?.fixed?.price;
    if (!price?.value) {
        return 'Free';
    }
    const amount = parseFloat(price.value);
    return `${price.currency ?? ''} ${amount.toFixed(2)}`.trim();
}

export function formatDurationMinutes(service: RawService): string {
    const minutes = service.schedule?.availabilityConstraints?.sessionDurations?.[0];
    if (!minutes) {
        return '';
    }
    return `${minutes} min`;
}

export function mapService(raw: RawService): BookingServiceView {
    const duration = formatDurationMinutes(raw);
    return {
        id: raw._id ?? raw.id ?? '',
        name: raw.name ?? 'Service',
        type: raw.type ?? 'APPOINTMENT',
        description: raw.description ?? '',
        priceLabel: formatPrice(raw),
        durationLabel: duration,
        formId: raw.form?._id ?? '',
    };
}

export function createSlotId(resourceId: string, localStartDate: string): string {
    return `${resourceId}:${localStartDate}`;
}

export function formatSlotLabel(localStartDate: string): string {
    const date = new Date(localStartDate);
    return date.toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function mapAppointmentSlot(slot: {
    scheduleId?: string;
    localStartDate?: string;
    localEndDate?: string;
}): BookingSlotView | null {
    if (!slot.scheduleId || !slot.localStartDate || !slot.localEndDate) {
        return null;
    }
    return {
        id: createSlotId(slot.scheduleId, slot.localStartDate),
        localStartDate: slot.localStartDate,
        localEndDate: slot.localEndDate,
        label: formatSlotLabel(slot.localStartDate),
        scheduleId: slot.scheduleId,
        serviceType: 'APPOINTMENT',
    };
}

export function mapClassSlot(slot: {
    eventInfo?: { eventId?: string };
    localStartDate?: string;
    localEndDate?: string;
}): BookingSlotView | null {
    const eventId = slot.eventInfo?.eventId;
    if (!eventId || !slot.localStartDate || !slot.localEndDate) {
        return null;
    }
    return {
        id: createSlotId(eventId, slot.localStartDate),
        localStartDate: slot.localStartDate,
        localEndDate: slot.localEndDate,
        label: formatSlotLabel(slot.localStartDate),
        eventId,
        serviceType: 'CLASS',
    };
}

export function localDateStr(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function paymentPreferenceFromService(service: RawService): 'ONLINE' | 'OFFLINE' {
    const opts = service.payment?.options ?? {};
    if (opts.online && !opts.inPerson) {
        return 'ONLINE';
    }
    if (!opts.online && opts.inPerson) {
        return 'OFFLINE';
    }
    return 'ONLINE';
}
