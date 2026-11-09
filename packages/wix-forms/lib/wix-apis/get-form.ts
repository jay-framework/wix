import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import { formIdPathSegment } from '../utils/form-id';

/** A Ricos rich-content node — some field types (e.g. long answer) carry their label as rich content. */
export interface RichContentNode {
    textData?: { text?: string };
    nodes?: RichContentNode[];
}

export type RawFieldLabel = string | RichContentNode;

export interface RawFormField {
    target?: string;
    hidden?: boolean;
    view?: {
        label?: RawFieldLabel;
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
        /** Present for a boolean (single-checkbox) field (DL#41 4c). */
        boolean?: Record<string, unknown>;
    };
    inputOptions?: {
        stringOptions?: {
            textInputOptions?: { label?: RawFieldLabel; placeholder?: string };
            componentType?: string;
            options?: Array<{ value?: string; label?: string }>;
        };
        /** Present for a single-checkbox (boolean) field (DL#41 4c). */
        booleanOptions?: Record<string, unknown>;
        /** Present for a multi-selection (array) choice field (DL#41 4c). */
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
    return wixFetch<GetFormResponse>(client, `/form-schema-service/v4/forms/${formIdPathSegment(formId)}`, {
        method: 'GET',
    });
}
