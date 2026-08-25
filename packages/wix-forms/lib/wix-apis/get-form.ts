import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';

export interface RawFormField {
    target?: string;
    hidden?: boolean;
    view?: {
        label?: string;
        placeholder?: string;
        fieldType?: string;
        options?: Array<{ value?: string; label?: string }>;
    };
    validation?: {
        required?: boolean;
        string?: {
            format?: string;
            minLength?: number;
            maxLength?: number;
            pattern?: string;
        };
    };
    inputOptions?: {
        stringOptions?: {
            textInputOptions?: { label?: string; placeholder?: string };
            componentType?: string;
            options?: Array<{ value?: string; label?: string }>;
        };
    };
}

export interface GetFormResponse {
    form?: {
        id?: string;
        fields?: RawFormField[];
        formFields?: RawFormField[];
    };
}

export async function getFormSchema(client: WixClient, formId: string): Promise<GetFormResponse> {
    return wixFetch<GetFormResponse>(client, `/form-schema-service/v4/forms/${formId}`, {
        method: 'GET',
    });
}
