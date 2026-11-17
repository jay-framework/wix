/**
 * Address field types (DL #52 §1). Client-safe: these travel in action outputs and in the
 * per-form fast-phase carry-forward.
 */

import type { FormFieldOptionView } from '../types.js';

/** An upper-case code from `ADDRESS_COUNTRY_CODES`. */
export type CountryCode = string;

/** Wix's own part keys, in the fixed superset order every address contract emits. */
export const ADDRESS_PARTS = [
    'country',
    'addressLine',
    'addressLine2',
    'streetName',
    'streetNumber',
    'city',
    'subdivision',
    'postalCode',
] as const;

export type AddressPart = (typeof ADDRESS_PARTS)[number];
export type LayoutPart = Exclude<AddressPart, 'country'>;
export const LAYOUT_PARTS: readonly LayoutPart[] = ADDRESS_PARTS.filter(
    (part): part is LayoutPart => part !== 'country',
);

/** The value both Create Booking and Create Submission accept: flat, with Wix's keys. */
export type AddressValue = Partial<Record<AddressPart, string>>;

export interface AddressPartSpec {
    part: LayoutPart;
    /** Resolved: config > plugin default. */
    label: string;
    /** The form's override, else the template's. */
    required: boolean;
    maxLength?: number;
    pattern?: string;
}

export interface AddressLayout {
    templateId: string;
    /** Shown parts, in template order. */
    parts: AddressPartSpec[];
    /** When `subdivision` is a part. */
    subdivisionLabel?: string;
    /** Listed by the template only; learned per-country lists live in `subdivisionsOf`. */
    subdivisions?: FormFieldOptionView[];
}

export interface AddressFieldSpec {
    /** Offered countries: value = code, label = display name. */
    countries: FormFieldOptionView[];
    initialCountry?: CountryCode;
    /** Key: templateId; only the templates the offered countries use. */
    layouts: Record<string, AddressLayout>;
    /** Offered country → templateId; absent → the COMMON template. */
    templateOf: Record<CountryCode, string>;
    /** Country → learned subdivision list (Q6); overrides an unlisted layout. */
    subdivisionsOf: Record<CountryCode, FormFieldOptionView[]>;
    /** Country → parts revealed at runtime (Q17). */
    revealedPartsOf: Record<CountryCode, LayoutPart[]>;
    /** Resolved part labels (config > default), for the country and for revealed parts. */
    partLabels: Record<AddressPart, string>;
}

/** The address facts `readFieldKey` reads from Get Form. */
export interface AddressSchemaFacts {
    allowedCountries: string[];
    partRequired: Partial<Record<LayoutPart, boolean>>;
    showAddressLine2: boolean;
    defaultCountry?: { type: 'BY_IP' | 'COUNTRY'; country?: string };
}

/** What the server learned from Wix's 400s, as the client and the fast phase receive it. */
export interface LearnedFactsSnapshot {
    subdivisionsOf?: Record<CountryCode, FormFieldOptionView[]>;
    revealedPartsOf?: Record<CountryCode, LayoutPart[]>;
}

/** Site-level copy overrides from `config/.wix-forms.yaml` `address.labels` (Q8). */
export interface AddressLabelsConfig {
    parts?: Partial<Record<LayoutPart | 'country', string>>;
    subdivisionPart?: Record<CountryCode, string>;
    subdivisions?: Record<CountryCode, Record<string, string>>;
}

export interface AddressConfig {
    /** `Intl.DisplayNames` locale for country names; default `en`. */
    locale?: string;
    labels?: AddressLabelsConfig;
}

export function isLayoutPart(value: unknown): value is LayoutPart {
    return typeof value === 'string' && (LAYOUT_PARTS as readonly string[]).includes(value);
}
