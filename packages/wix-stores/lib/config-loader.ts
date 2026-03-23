/**
 * Configuration loader for wix-stores plugin.
 *
 * Reads optional config from config/.wix-stores.yaml.
 * When the file doesn't exist, returns empty defaults (no category prefixes).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { type CategoryPrefixConfig } from './services/wix-stores-service';

export interface WixStoresConfig {
    categoryPrefixes: CategoryPrefixConfig[];
}

/**
 * Load wix-stores config from config/.wix-stores.yaml.
 * Returns empty defaults when the config file doesn't exist.
 */
export function loadWixStoresConfig(): WixStoresConfig {
    const configPath = path.join(process.cwd(), 'config', '.wix-stores.yaml');

    if (!fs.existsSync(configPath)) {
        return { categoryPrefixes: [] };
    }

    const fileContents = fs.readFileSync(configPath, 'utf8');
    const raw = yaml.load(fileContents) as any;

    if (!raw) {
        return { categoryPrefixes: [] };
    }

    const prefixes: CategoryPrefixConfig[] = [];

    if (Array.isArray(raw.categoryPrefixes)) {
        for (const entry of raw.categoryPrefixes) {
            if (typeof entry.categoryId === 'string' && typeof entry.prefix === 'string') {
                prefixes.push({
                    categoryId: entry.categoryId.trim(),
                    prefix: entry.prefix.trim(),
                    name: typeof entry.name === 'string' ? entry.name.trim() : entry.prefix.trim(),
                });
            }
        }
    }

    return { categoryPrefixes: prefixes };
}
