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
        /** Present for a boolean (single-checkbox) field (DL#39 4c). */
        boolean?: Record<string, unknown>;
    };
    inputOptions?: {
        stringOptions?: {
            textInputOptions?: { label?: string; placeholder?: string };
            componentType?: string;
            options?: Array<{ value?: string; label?: string }>;
        };
        /** Present for a single-checkbox (boolean) field (DL#39 4c). */
        booleanOptions?: Record<string, unknown>;
        /** Present for a multi-selection (array) choice field (DL#39 4c). */
        arrayOptions?: {
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
