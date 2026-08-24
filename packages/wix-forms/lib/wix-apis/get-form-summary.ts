import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface FormSummaryField {
    target?: string;
    id?: string;
    label?: string;
    type?: string;
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
        `/form-schema-service/v4/forms/${formId}/summary`,
        { method: 'GET' },
    );
}
