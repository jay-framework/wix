import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import { formIdPathSegment } from '../utils/form-id';

export interface FormSummaryField {
    target?: string;
    id?: string;
    label?: string;
    type?: string;
    /** Not returned by the Wix Form Summary API (QA 2026-11-10) — always undefined in practice. */
    required?: boolean;
    deleted?: boolean;
}

export interface GetFormSummaryResponse {
    formSummary?: {
        fields?: FormSummaryField[];
    };
}

export async function getFormSummary(
    client: WixClient,
    formId: string,
): Promise<GetFormSummaryResponse> {
    return wixFetch<GetFormSummaryResponse>(
        client,
        `/form-schema-service/v4/forms/${formIdPathSegment(formId)}/summary`,
        { method: 'GET' },
    );
}
