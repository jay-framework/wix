import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { isSupportedCountry } from 'libphonenumber-js/min';
import type { FormInclude } from './wix-apis/list-forms.js';

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
    };
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
