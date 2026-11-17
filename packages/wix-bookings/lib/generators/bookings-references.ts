import { participantFormId } from '../utils/format.js';
import type { RawBookingService } from '../wix-apis/query-services.js';

const DESCRIPTION =
    'Wix Bookings services for agent discovery. Use serviceId with dashboard path bookings/services/form/<serviceId>. participantFormHasAddress: the participant form has an address, so a booking-flow page must bind the address parts.';

export function serviceId(service: RawBookingService): string {
    return service._id ?? service.id ?? '';
}

/**
 * `participantFormHasAddress` per service id (DL #52 §6): true / false when known; a service
 * absent from the map (its form could not be read) gets no flag, which the validator warns about.
 */
export type ParticipantAddressFlags = ReadonlyMap<string, boolean>;

export function buildServicesReference(
    services: RawBookingService[],
    addressFlags: ParticipantAddressFlags = new Map(),
) {
    const visible = services.filter((s) => !s.hidden);
    return {
        _description: DESCRIPTION,
        totalServices: services.length,
        visibleServices: visible.length,
        services: visible.map((service) => {
            const id = serviceId(service);
            return {
                serviceId: id,
                name: service.name ?? '',
                type: service.type ?? '',
                formId: participantFormId(service.form),
                dashboardPath: id ? `bookings/services/form/${id}` : '',
                ...(addressFlags.has(id)
                    ? { participantFormHasAddress: addressFlags.get(id) }
                    : {}),
                payment: {
                    online: service.payment?.options?.online ?? false,
                    inPerson: service.payment?.options?.inPerson ?? false,
                    currency: service.payment?.fixed?.price?.currency ?? '',
                },
            };
        }),
    };
}

export function buildSiteReference(input: {
    staffResourceTypeId: string;
    staffMembers: { id: string; resourceId: string }[];
}) {
    return {
        _description:
            'Site-level Bookings config and staff resources. staffResourceTypeId is required for ANY_RESOURCE slot queries; setup fills it from Wix when empty.',
        staffResourceTypeId: input.staffResourceTypeId,
        staffMembers: input.staffMembers,
    };
}
