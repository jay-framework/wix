import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client';
import { formIdPathSegment } from '../utils/form-id';

/** A Ricos rich-content node — some field types (e.g. long answer) carry their label as rich content. */
export interface RichContentNode {
    textData?: { text?: string };
    nodes?: RichContentNode[];
}

export type RawFieldLabel = string | RichContentNode;

export interface RawFieldOption {
    value?: string;
    label?: string;
}

/** A `<component>Options` object (`textInputOptions`, `dropdownOptions`, …). */
export interface RawComponentOptions {
    label?: RawFieldLabel;
    placeholder?: string;
    options?: RawFieldOption[];
    /** Documented as `{ label?, placeholder? }`; present when the custom ("Other") option is on. */
    customOption?: Record<string, unknown> | null;
    /** A Wix Phone field's Default country, ISO code (`phoneInputOptions`, DL#55 L7 capture). */
    defaultCountryCode?: string;
}

/**
 * A `<type>Options` object (`stringOptions`, `arrayOptions`, …): the component type, its validation,
 * and one `<component>Options` object, named after the component (DL #51 read rules).
 */
export interface RawTypeOptions {
    componentType?: string;
    validation?: {
        format?: string;
        enum?: unknown[];
        minLength?: number;
        maxLength?: number;
        pattern?: string;
        /** A Wix Phone field's Accepted countries, ISO codes (DL#55 L7 capture). */
        phoneOptions?: { allowedCountryCodes?: string[] };
        items?: {
            itemType?: string;
            stringOptions?: { format?: string; enum?: unknown[] };
        };
    };
    [componentOptions: string]: unknown;
}

/** One `formFields[]` entry of Get Form / List Forms (DL #51 F1). */
export interface RawFormField {
    id?: string;
    fieldType?: 'INPUT' | 'DISPLAY';
    identifier?: string;
    hidden?: boolean;
    inputOptions?: {
        target?: string;
        required?: boolean;
        readOnly?: boolean;
        inputType?: string;
        stringOptions?: RawTypeOptions;
        booleanOptions?: RawTypeOptions;
        arrayOptions?: RawTypeOptions;
        addressOptions?: RawTypeOptions;
        wixFileOptions?: RawTypeOptions;
        numberOptions?: RawTypeOptions;
    };
}

export interface RawLayoutItem {
    fieldId?: string;
    row?: number;
    column?: number;
}

export interface RawFormStep {
    layout?: { large?: { items?: RawLayoutItem[] } };
}

export interface GetFormResponse {
    form?: {
        id?: string;
        formFields?: RawFormField[];
        steps?: RawFormStep[];
    };
}

export type RawForm = NonNullable<GetFormResponse['form']>;

export async function getFormSchema(client: WixClient, formId: string): Promise<GetFormResponse> {
    return wixFetch<GetFormResponse>(
        client,
        `/form-schema-service/v4/forms/${formIdPathSegment(formId)}`,
        {
            method: 'GET',
        },
    );
}
