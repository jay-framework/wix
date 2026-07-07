import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

export interface WixMembersConfig {
    authCallbackUrl: string;
}

const DEFAULTS: WixMembersConfig = {
    authCallbackUrl: '/auth/callback',
};

export function loadWixMembersConfig(projectRoot?: string): WixMembersConfig {
    const root = projectRoot ?? process.cwd();
    const configPath = path.join(root, 'config', '.wix-members.yaml');

    if (!fs.existsSync(configPath)) {
        return DEFAULTS;
    }

    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown> | null;
    if (!raw) {
        return DEFAULTS;
    }

    return {
        authCallbackUrl:
            typeof raw.authCallbackUrl === 'string'
                ? raw.authCallbackUrl
                : DEFAULTS.authCallbackUrl,
    };
}
