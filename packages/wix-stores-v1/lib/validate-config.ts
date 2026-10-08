/**
 * Validation rules for config/.wix-stores-v1.yaml (setup + jay-stack validate).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { WixStoresV1Config } from './config-loader.js';
import { loadWixStoresV1Config, WIX_STORES_V1_CONFIG_FILE_NAME } from './config-loader.js';

export interface ConfigValidationIssue {
    severity: 'error' | 'warning';
    message: string;
    suggestion?: string;
}

/** Reasonable URL slug shape (Wix product slugs are usually lowercase hyphenated). */
const SLUG_SHAPE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const LARGE_CATALOG_PRODUCT_ORDER_THRESHOLD = 200;
export const UNKNOWN_SLUG_WARNING_CAP = 10;

const LOCALE_CHARACTERS_RE = /^[a-zA-Z0-9-]+$/;

export function validateLocale(locale: string | null): ConfigValidationIssue[] {
    if (!locale) {
        return [];
    }
    if (!LOCALE_CHARACTERS_RE.test(locale)) {
        return [
            {
                severity: 'error',
                message: `Invalid locale "${locale}" — use a BCP 47 tag with letters, digits, and hyphens only (for example he-IL, en-US).`,
                suggestion:
                    'Copy the regional setting from the Wix dashboard → Settings → Language & region.',
            },
        ];
    }
    try {
        new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });
        return [];
    } catch {
        return [
            {
                severity: 'error',
                message: `Invalid locale "${locale}" — use a BCP 47 tag (for example he-IL, en-US).`,
                suggestion:
                    'Copy the regional setting from the Wix dashboard → Settings → Language & region.',
            },
        ];
    }
}

export function validateProductOrderSlugs(
    productOrder: string[],
    options?: { catalogSlugs?: Set<string>; productCount?: number },
): ConfigValidationIssue[] {
    const issues: ConfigValidationIssue[] = [];

    const seen = new Set<string>();
    const duplicates: string[] = [];
    const badShape: string[] = [];
    const unknown: string[] = [];

    for (const slug of productOrder) {
        if (slug.length === 0) {
            issues.push({
                severity: 'error',
                message:
                    'productOrder contains an empty slug entry — remove it or set a product URL slug.',
            });
            continue;
        }
        if (seen.has(slug)) {
            duplicates.push(slug);
        } else {
            seen.add(slug);
        }
        if (!SLUG_SHAPE_RE.test(slug)) {
            badShape.push(slug);
        }
        if (options?.catalogSlugs && !options.catalogSlugs.has(slug)) {
            unknown.push(slug);
        }
    }

    if (duplicates.length > 0) {
        issues.push({
            severity: 'warning',
            message: `Duplicate productOrder slugs: ${formatSlugList(duplicates)}`,
        });
    }
    if (badShape.length > 0) {
        issues.push({
            severity: 'warning',
            message: `productOrder slugs with unusual shape (expected lowercase letters, digits, hyphens): ${formatSlugList(badShape)}`,
        });
    }
    if (unknown.length > 0) {
        const listed = unknown.slice(0, UNKNOWN_SLUG_WARNING_CAP);
        const suffix =
            unknown.length > UNKNOWN_SLUG_WARNING_CAP
                ? ` (and ${unknown.length - UNKNOWN_SLUG_WARNING_CAP} more)`
                : '';
        issues.push({
            severity: 'warning',
            message: `productOrder slugs not found in the catalog: ${formatSlugList(listed)}${suffix}`,
            suggestion: 'Use each product slug field from the V1 API, not the product name or SKU.',
        });
    }

    if (
        productOrder.length > 0 &&
        options?.productCount !== undefined &&
        options.productCount > LARGE_CATALOG_PRODUCT_ORDER_THRESHOLD
    ) {
        issues.push({
            severity: 'warning',
            message: `productOrder is set but the catalog has ${options.productCount} products — the default shop listing fetches the full catalog when manual order applies.`,
            suggestion:
                'See agent-kit/designer/store-configuration.md (performance) or trim productOrder for large stores.',
        });
    }

    return issues;
}

export function validateWixStoresV1ConfigValue(
    config: WixStoresV1Config,
    options?: { catalogSlugs?: Set<string>; productCount?: number },
): ConfigValidationIssue[] {
    return [
        ...validateLocale(config.locale),
        ...validateProductOrderSlugs(config.productOrder, options),
    ];
}

export function validateWixStoresV1Config(
    projectRoot: string,
    options?: { catalogSlugs?: Set<string>; productCount?: number },
): ConfigValidationIssue[] {
    const configPath = path.join(projectRoot, 'config', WIX_STORES_V1_CONFIG_FILE_NAME);
    if (!fs.existsSync(configPath)) {
        return [];
    }
    const config = loadWixStoresV1Config(projectRoot);
    return validateWixStoresV1ConfigValue(config, options);
}

function formatSlugList(slugs: string[]): string {
    return slugs.map((slug) => `"${slug}"`).join(', ');
}
