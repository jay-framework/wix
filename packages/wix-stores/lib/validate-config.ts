/**
 * Validation rules for config/.wix-stores.yaml (setup + jay-stack validate).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { WixStoresConfig } from './config-loader.js';
import { loadWixStoresConfig, WIX_STORES_CONFIG_FILE_NAME } from './config-loader.js';

export interface ConfigValidationIssue {
    severity: 'error' | 'warning';
    message: string;
    suggestion?: string;
}

const LOCALE_CHARACTERS_RE = /^[a-zA-Z0-9-]+$/;
const ALLOWED_URL_PLACEHOLDERS = new Set(['slug', 'category', 'prefix']);

function extractPlaceholders(template: string): string[] {
    const placeholders: string[] = [];
    for (const match of template.matchAll(/\{([^}]+)\}/g)) {
        placeholders.push(match[1]);
    }
    return placeholders;
}

function unknownPlaceholders(template: string): string[] {
    return extractPlaceholders(template).filter((name) => !ALLOWED_URL_PLACEHOLDERS.has(name));
}

export function validateLocale(locale: string | null | undefined): ConfigValidationIssue[] {
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

export function validateUrlTemplates(
    urls: WixStoresConfig['urls'],
): ConfigValidationIssue[] {
    const issues: ConfigValidationIssue[] = [];
    const product = urls.product;

    if (!product || product.trim().length === 0) {
        issues.push({
            severity: 'error',
            message: 'urls.product must be a non-empty path template.',
        });
        return issues;
    }

    if (!product.startsWith('/')) {
        issues.push({
            severity: 'error',
            message: `urls.product must start with "/" (got "${product}").`,
        });
    }

    if (!product.includes('{slug}')) {
        issues.push({
            severity: 'error',
            message: 'urls.product must include the {slug} placeholder for product links.',
        });
    }

    const badProductPlaceholders = unknownPlaceholders(product);
    if (badProductPlaceholders.length > 0) {
        issues.push({
            severity: 'error',
            message: `urls.product has unknown placeholders: ${badProductPlaceholders.map((p) => `{${p}}`).join(', ')}. Allowed: {slug}, {category}, {prefix}.`,
        });
    }

    const productUsesCategory = product.includes('{category}') || product.includes('{prefix}');
    if (productUsesCategory && !urls.category) {
        issues.push({
            severity: 'warning',
            message:
                'urls.product uses {category} or {prefix} but urls.category is not set — category deep links and some product URLs may be incomplete.',
            suggestion: 'Set urls.category (for example "/products/{prefix}/{category}").',
        });
    }

    if (urls.category !== null) {
        const category = urls.category;
        if (category.trim().length === 0) {
            issues.push({
                severity: 'error',
                message: 'urls.category must be a non-empty path template or omitted (null).',
            });
        } else {
            if (!category.startsWith('/')) {
                issues.push({
                    severity: 'error',
                    message: `urls.category must start with "/" (got "${category}").`,
                });
            }
            if (!category.includes('{category}')) {
                issues.push({
                    severity: 'warning',
                    message: 'urls.category should include {category} so category pages resolve correctly.',
                });
            }
            const badCategoryPlaceholders = unknownPlaceholders(category);
            if (badCategoryPlaceholders.length > 0) {
                issues.push({
                    severity: 'error',
                    message: `urls.category has unknown placeholders: ${badCategoryPlaceholders.map((p) => `{${p}}`).join(', ')}. Allowed: {slug}, {category}, {prefix}.`,
                });
            }
            if (product.includes('{prefix}') && !category.includes('{prefix}')) {
                issues.push({
                    severity: 'warning',
                    message:
                        'urls.product uses {prefix} but urls.category does not — prefix segments may be inconsistent on category pages.',
                });
            }
        }
    }

    return issues;
}

export function validateDefaultCategory(
    defaultCategory: string | null,
    options?: { categorySlugs?: Set<string> },
): ConfigValidationIssue[] {
    const issues: ConfigValidationIssue[] = [];
    if (defaultCategory === null) {
        return issues;
    }
    if (defaultCategory.length === 0) {
        issues.push({
            severity: 'error',
            message: 'defaultCategory must be a non-empty category slug or omitted.',
        });
        return issues;
    }
    if (options?.categorySlugs && !options.categorySlugs.has(defaultCategory)) {
        issues.push({
            severity: 'warning',
            message: `defaultCategory slug "${defaultCategory}" was not found in the store category tree.`,
            suggestion: 'Run jay-stack agent-kit and check agent-kit/references/wix-stores/categories.yaml.',
        });
    }
    return issues;
}

export function validateWixStoresConfigValue(
    config: WixStoresConfig,
    options?: { categorySlugs?: Set<string> },
): ConfigValidationIssue[] {
    return [
        ...validateLocale(config.locale ?? null),
        ...validateUrlTemplates(config.urls),
        ...validateDefaultCategory(config.defaultCategory, options),
    ];
}

export function validateWixStoresConfig(
    projectRoot: string,
    options?: { categorySlugs?: Set<string> },
): ConfigValidationIssue[] {
    const configPath = path.join(projectRoot, 'config', WIX_STORES_CONFIG_FILE_NAME);
    if (!fs.existsSync(configPath)) {
        return [];
    }
    const config = loadWixStoresConfig(projectRoot);
    return validateWixStoresConfigValue(config, options);
}
