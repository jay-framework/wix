import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
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
    };
}

function defaultConfig(): WixFormsConfig {
    return {
        namespace: DEFAULT_FORMS_NAMESPACE,
        formIds: [],
        include: 'enabled',
    };
}
