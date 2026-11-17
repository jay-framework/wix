/**
 * Where a service's participant form comes from (DL #51 §3, §3a): the form id from the service,
 * canonicalised, then Get Form through a per-instance cache shared by `getParticipantForm` and
 * `createBooking`. Every failure throws; callers decide how to surface it.
 */

import { canonicalFormId, type RawForm, type WixFormsService } from '@jay-framework/wix-forms';
import { SLOW_RENDER_TTL } from '../slow-render-defaults.js';
import { participantFormId } from '../utils/format.js';
import type { RawBookingService } from '../wix-apis/query-services.js';

const RAW_FORM_TTL_MS = SLOW_RENDER_TTL * 1000;

export interface ParticipantFormSource {
    formId: string;
    rawForm: RawForm;
}

export type LoadParticipantForm = (
    service: RawBookingService | undefined,
    forms: WixFormsService,
) => Promise<ParticipantFormSource>;

interface CachedRawForm {
    rawForm: Promise<RawForm>;
    expiresAt: number;
}

export function createParticipantFormLoader(): LoadParticipantForm {
    // Key: canonical form id (the all-zero id is its own). Concurrent callers share one call.
    const cache = new Map<string, CachedRawForm>();

    function cachedRawForm(formId: string, forms: WixFormsService): Promise<RawForm> {
        const cached = cache.get(formId);
        if (cached && cached.expiresAt > Date.now()) return cached.rawForm;
        const rawForm = forms.getRawForm(formId);
        cache.set(formId, { rawForm, expiresAt: Date.now() + RAW_FORM_TTL_MS });
        rawForm.catch(() => {
            if (cache.get(formId)?.rawForm === rawForm) cache.delete(formId);
        });
        return rawForm;
    }

    return async (service, forms) => {
        if (!service) throw new Error('Booking service not found.');
        const rawFormId = participantFormId(service.form);
        if (!rawFormId) throw new Error('This booking service has no participant form.');
        const formId = canonicalFormId(rawFormId);
        if (!formId) throw new Error('Form ID is not a valid Wix form id.');
        return { formId, rawForm: await cachedRawForm(formId, forms) };
    };
}
