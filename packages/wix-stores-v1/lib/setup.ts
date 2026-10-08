/**
 * Setup handler for wix-stores-v1 plugin.
 * Validates Stores V1 API access, writes config template, and checks config/.wix-stores-v1.yaml.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';
import { getService } from '@jay-framework/stack-server-runtime';
import { fetchCatalogProductSlugs } from './catalog-slugs.js';
import { WIX_STORES_V1_CONFIG_FILE_NAME, loadWixStoresV1Config } from './config-loader.js';
import {
    WIX_STORES_V1_SERVICE_MARKER,
    type WixStoresV1Service,
} from './services/wix-stores-v1-service.js';
import { queryProducts } from './wix-apis/index.js';
import type { ConfigValidationIssue } from './validate-config.js';
import { validateWixStoresV1ConfigValue } from './validate-config.js';

export const CONFIG_TEMPLATE = `# Wix Stores V1 configuration (config/.wix-stores-v1.yaml)
#
# BCP 47 — copy from the Wix site dashboard → Settings → Language & region (regional settings).
# Omit or leave unset to keep the Catalog V1 API formatted price strings on product cards.
# locale: 'he-IL'
#
# Product URL slugs (product.slug from the V1 API), in the order they should appear on the
# default shop listing (relevance sort, no filters). NOT product names, SKUs, or collection IDs.
# productOrder:
#   - 'i-m-a-product'
#   - 'blue-widget'
#
# Full reference: agent-kit/designer/store-configuration.md (materialized after jay-stack agent-kit)

`;

function formatConfigIssues(issues: ConfigValidationIssue[]): string {
    if (issues.length === 0) {
        return '';
    }
    const lines = issues.map((issue) => {
        const label = issue.severity === 'error' ? 'Error' : 'Warning';
        const hint = issue.suggestion ? ` ${issue.suggestion}` : '';
        return `  - ${label}: ${issue.message}${hint}`;
    });
    return `\n\nConfig (${WIX_STORES_V1_CONFIG_FILE_NAME}):\n${lines.join('\n')}`;
}

export async function setupWixStoresV1(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    let service: WixStoresV1Service;
    try {
        service = getService(WIX_STORES_V1_SERVICE_MARKER) as WixStoresV1Service;
    } catch {
        return {
            status: 'error',
            message: 'WixStoresV1Service not available. Run setup for wix-server-client first.',
        };
    }

    const configPath = path.join(ctx.configDir, WIX_STORES_V1_CONFIG_FILE_NAME);
    const configCreated: string[] = [];

    if (!fs.existsSync(configPath)) {
        if (!fs.existsSync(ctx.configDir)) {
            fs.mkdirSync(ctx.configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
        configCreated.push(`config/${WIX_STORES_V1_CONFIG_FILE_NAME}`);
    }

    try {
        await queryProducts(service.wixClient, { paging: { limit: 1 } });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const hint =
            msg.includes('404') || msg.includes('not found')
                ? 'Wix Stores may not be installed on this site'
                : msg.includes('403') || msg.includes('permission')
                  ? 'API key may lack Wix Stores permissions'
                  : 'This package requires the Stores Catalog V1 API — if using Catalog V3, use @jay-framework/wix-stores instead';
        return {
            status: 'error',
            message: `Wix Stores V1 API check failed: ${hint}. (${msg})`,
        };
    }

    const config = loadWixStoresV1Config(ctx.projectRoot);
    let catalogSlugs: Set<string> | undefined;
    let productCount: number | undefined;

    if (config.productOrder.length > 0) {
        try {
            const catalog = await fetchCatalogProductSlugs(service.wixClient);
            catalogSlugs = catalog.slugs;
            productCount = catalog.totalCount;
        } catch {
            // Setup still succeeds; slug checks are best-effort when the catalog cannot be read.
        }
    }

    const configIssues = validateWixStoresV1ConfigValue(config, {
        catalogSlugs,
        productCount,
    });
    const hasConfigErrors = configIssues.some((issue) => issue.severity === 'error');

    let message = 'Wix Stores V1 connected';
    message += formatConfigIssues(configIssues);

    return {
        status: hasConfigErrors ? 'needs-config' : 'configured',
        message,
        ...(configCreated.length > 0 ? { configCreated } : {}),
    };
}
