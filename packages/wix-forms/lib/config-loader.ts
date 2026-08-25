import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export interface WixFormsConfig {
    defaultFormId: string;
}

const CONFIG_RELATIVE_PATH = path.join('config', '.wix-forms.yaml');

export function loadWixFormsConfig(projectRoot: string): WixFormsConfig {
    const configPath = path.join(projectRoot, CONFIG_RELATIVE_PATH);
    if (!fs.existsSync(configPath)) {
        return { defaultFormId: '' };
    }
    const raw = yaml.load(fs.readFileSync(configPath, 'utf-8')) as
        | (Partial<WixFormsConfig> & { defaultContactFormId?: string })
        | null;
    return {
        defaultFormId: raw?.defaultFormId ?? raw?.defaultContactFormId ?? '',
    };
}
