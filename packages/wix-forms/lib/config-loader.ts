import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { isSupportedCountry } from 'libphonenumber-js/min';
import type { FormInclude } from './wix-apis/list-forms.js';
import type { AddressConfig, AddressLabelsConfig } from './address/address-types.js';

/**
 * Wix Forms config: per-form contract generation and, through `formIds`, the runtime submit
 * allowlist. Absent config → generate every enabled form in the default namespace, and accept
 * submissions for those forms.
 */
export interface WixFormsConfig {
    /** List Forms namespace. Default: the standalone Wix Forms namespace. */
    namespace: string;
    /**
     * Optional form ids: restricts generation to these forms and is the runtime submit allowlist
     * (`submitForm` refuses other forms).
     */
    formIds: string[];
    /**
     * Which forms to enumerate for generation. Default: `enabled`. The runtime allowlist always
     * uses enabled forms.
     */
    include: FormInclude;
    /**
     * Country of phones typed without a country code (DL#55 P1c), ISO 3166-1 alpha-2, upper case.
     * A Wix Phone field's own default country wins. Unset: such phones are refused in the browser.
     */
    defaultPhoneCountry?: string;
    /** Address copy (DL #52 Q8): `locale` for country names, `labels` merged per key into the defaults. */
    address?: AddressConfig;
}

/**
 * Default List Forms namespace for standalone Wix Forms.
 * If your site uses a different namespace, set `namespace` in `config/.wix-forms.yaml`
 * after checking the List Forms API response for that site.
 */
export const DEFAULT_FORMS_NAMESPACE = 'wix.form_app.form';

const CONFIG_RELATIVE_PATH = path.join('config', '.wix-forms.yaml');

interface RawWixFormsConfig {
    namespace?: string;
    formIds?: string[];
    include?: FormInclude;
    defaultPhoneCountry?: string;
    address?: unknown;
}

export function loadWixFormsConfig(projectRoot: string): WixFormsConfig {
    const configPath = path.join(projectRoot, CONFIG_RELATIVE_PATH);
    if (!fs.existsSync(configPath)) {
        return defaultConfig();
    }
    const raw = yaml.load(fs.readFileSync(configPath, 'utf-8')) as RawWixFormsConfig | null;
    return {
        namespace: raw?.namespace?.trim() || DEFAULT_FORMS_NAMESPACE,
        formIds: Array.isArray(raw?.formIds) ? raw!.formIds : [],
        include: raw?.include ?? 'enabled',
        ...phoneCountryOf(raw?.defaultPhoneCountry),
        ...addressConfigOf(raw?.address),
    };
}

/** `address: { locale?, labels? { parts?, subdivisionPart?, subdivisions? } }`; a wrong shape fails init. */
function addressConfigOf(rawValue: unknown): Pick<WixFormsConfig, 'address'> {
    if (rawValue === undefined || rawValue === null) return {};
    if (!isPlainObject(rawValue)) throw addressConfigError('must be a mapping');
    const { locale, labels } = rawValue as { locale?: unknown; labels?: unknown };
    if (locale !== undefined && (typeof locale !== 'string' || !isSupportedLocale(locale))) {
        throw addressConfigError(
            `locale "${String(locale)}" is not a locale Intl.DisplayNames supports`,
        );
    }
    return {
        address: {
            ...(typeof locale === 'string' ? { locale } : {}),
            ...(labels === undefined ? {} : { labels: addressLabelsOf(labels) }),
        },
    };
}

function addressLabelsOf(rawValue: unknown): AddressLabelsConfig {
    if (!isPlainObject(rawValue)) throw addressConfigError('labels must be a mapping');
    const { parts, subdivisionPart, subdivisions } = rawValue as Record<string, unknown>;
    return {
        ...(parts === undefined ? {} : { parts: stringMap(parts, 'labels.parts') }),
        ...(subdivisionPart === undefined
            ? {}
            : { subdivisionPart: upperKeys(stringMap(subdivisionPart, 'labels.subdivisionPart')) }),
        ...(subdivisions === undefined ? {} : { subdivisions: subdivisionNames(subdivisions) }),
    };
}

function subdivisionNames(rawValue: unknown): Record<string, Record<string, string>> {
    if (!isPlainObject(rawValue)) throw addressConfigError('labels.subdivisions must be a mapping');
    return Object.fromEntries(
        Object.entries(rawValue as Record<string, unknown>).map(([country, names]) => [
            country.toUpperCase(),
            upperKeys(stringMap(names, `labels.subdivisions.${country}`)),
        ]),
    );
}

/** YAML reads `'25': Lombardia` and `25: Lombardia` alike; values must be strings. */
function stringMap(rawValue: unknown, where: string): Record<string, string> {
    if (!isPlainObject(rawValue)) throw addressConfigError(`${where} must be a mapping`);
    return Object.fromEntries(
        Object.entries(rawValue as Record<string, unknown>).map(([key, value]) => {
            if (typeof value !== 'string')
                throw addressConfigError(`${where}.${key} must be a string`);
            return [key, value];
        }),
    );
}

function upperKeys(map: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(map).map(([key, value]) => [key.toUpperCase(), value]),
    );
}

function isPlainObject(value: unknown): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSupportedLocale(locale: string): boolean {
    try {
        return Intl.DisplayNames.supportedLocalesOf([locale]).length > 0;
    } catch {
        return false;
    }
}

function addressConfigError(problem: string): Error {
    return new Error(`config/.wix-forms.yaml: address ${problem}. Fix or remove the key.`);
}

/** A bad code fails init loudly; otherwise every local phone would fail quietly (DL#55 P1c). */
function phoneCountryOf(rawValue: unknown): Pick<WixFormsConfig, 'defaultPhoneCountry'> {
    if (rawValue === undefined || rawValue === null) return {};
    const country = String(rawValue).trim().toUpperCase();
    if (!isSupportedCountry(country)) {
        throw new Error(
            `config/.wix-forms.yaml: defaultPhoneCountry "${country}" is not a country code libphonenumber-js supports (use an ISO 3166-1 alpha-2 code, e.g. IL, US, GB). Fix or remove the key.`,
        );
    }
    return { defaultPhoneCountry: country };
}

function defaultConfig(): WixFormsConfig {
    return {
        namespace: DEFAULT_FORMS_NAMESPACE,
        formIds: [],
        include: 'enabled',
    };
}
