/**
 * Configuration loader for wix-cart plugin.
 * Reads optional config from config/.wix-cart.yaml.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface WixCartConfig {
    urls: { thankYou: string };
}

export function loadWixCartConfig(): WixCartConfig {
    const configPath = path.join(process.cwd(), 'config', '.wix-cart.yaml');

    const defaults: WixCartConfig = {
        urls: { thankYou: '/thank-you' },
    };

    if (!fs.existsSync(configPath)) return defaults;

    try {
        const raw = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any;
        return {
            urls: {
                thankYou: raw?.urls?.thankYou || defaults.urls.thankYou,
            },
        };
    } catch {
        return defaults;
    }
}
