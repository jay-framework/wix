import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export interface WixFormsConfig {
    defaultContactFormId: string;
}

const CONFIG_RELATIVE_PATH = path.join('config', '.wix-forms.yaml');

export function loadWixFormsConfig(projectRoot: string): WixFormsConfig {
    const configPath = path.join(projectRoot, CONFIG_RELATIVE_PATH);
    if (!fs.existsSync(configPath)) {
        return { defaultContactFormId: '' };
    }
    const raw = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Partial<WixFormsConfig> | null;
    return {
        defaultContactFormId: raw?.defaultContactFormId ?? '',
    };
}
