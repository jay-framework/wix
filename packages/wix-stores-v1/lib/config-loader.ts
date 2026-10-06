/**
 * Configuration loader for wix-stores-v1 plugin.
 *
 * Reads optional config from config/.wix-stores-v1.yaml.
 * When the file doesn't exist, returns defaults.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface WixStoresV1Config {
    /**
     * Locale product card prices are formatted with (BCP 47, e.g. "he-IL" — a Wix site's regional setting).
     * Not set = the API's formatted price.
     */
    locale: string | null;
    /**
     * Product slugs listed first, in this order, by the default (relevance, unfiltered) product search — e.g. a
     * Wix collection's manual order, which no public V1 query returns. Other products follow by numericId.
     * Empty = the API's order.
     */
    productOrder: string[];
}

/**
 * Load wix-stores-v1 config from config/.wix-stores-v1.yaml.
 * Returns defaults when the config file doesn't exist.
 */
export function loadWixStoresV1Config(projectRoot?: string): WixStoresV1Config {
    const configPath = path.join(projectRoot ?? process.cwd(), 'config', '.wix-stores-v1.yaml');
    const raw = fs.existsSync(configPath)
        ? (yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown> | null)
        : null;
    return {
        locale: typeof raw?.locale === 'string' ? raw.locale : null,
        productOrder: Array.isArray(raw?.productOrder)
            ? raw.productOrder.filter((slug): slug is string => typeof slug === 'string')
            : [],
    };
}
