import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { FormInclude } from './wix-apis/list-forms.js';

/**
 * Wix Forms config (DL#36 §1).
 *
 * Optional filter/override for per-form contract generation — NOT a form list.
 * Absent config → generate every enabled form in the default namespace.
 */
export interface WixFormsConfig {
    /** List Forms namespace (OQ-8). Default: the standalone Wix Forms namespace. */
    namespace: string;
    /** Optional whitelist — restrict generation to these form ids. */
    formIds: string[];
    /** Which forms to enumerate. Default: `enabled`. */
    include: FormInclude;
}

/**
 * The standalone Wix Forms namespace (OQ-8).
 * ⚠️ Confirm against a live site's List Forms response — see DL#36 Implementation Results.
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
