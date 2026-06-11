/**
 * Configuration loader for wix-stores plugin.
 *
 * Reads optional config from config/.wix-stores.yaml.
 * When the file doesn't exist, returns defaults.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * URL templates for building canonical product and category links.
 * Placeholders: {slug}, {category}, {prefix}
 */
export interface UrlTemplates {
    /** URL template for product pages. Default: "/products/{slug}" */
    product: string;
    /** URL template for category pages. Not set = no category deep-linking */
    category: string | null;
}

export interface WixStoresConfig {
    urls: UrlTemplates;
    /** Slug of the fallback category for pages without category context */
    defaultCategory: string | null;
}

/**
 * Load wix-stores config from config/.wix-stores.yaml.
 * Returns defaults when the config file doesn't exist.
 */
export function loadWixStoresConfig(projectRoot?: string): WixStoresConfig {
    const root = projectRoot ?? process.cwd();
    const configPath = path.join(root, 'config', '.wix-stores.yaml');

    const defaults: WixStoresConfig = {
        urls: { product: '/products/{slug}', category: null },
        defaultCategory: null,
    };

    if (!fs.existsSync(configPath)) {
        return defaults;
    }

    const fileContents = fs.readFileSync(configPath, 'utf8');
    const raw = yaml.load(fileContents) as Record<string, unknown> | null;

    if (!raw) {
        return defaults;
    }

    const urls = raw.urls as Record<string, unknown> | undefined;

    return {
        urls: {
            product: typeof urls?.product === 'string' ? urls.product : defaults.urls.product,
            category: typeof urls?.category === 'string' ? urls.category : null,
        },
        defaultCategory: typeof raw.defaultCategory === 'string' ? raw.defaultCategory : null,
    };
}
