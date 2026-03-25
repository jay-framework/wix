/**
 * Setup handler for wix-stores plugin (Design Log #87, #10).
 *
 * Validates that wix-server-client is configured.
 * Creates config/.wix-stores.yaml with example category prefix config if missing.
 * Generates category tree reference for agent discovery.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type {
    PluginSetupContext,
    PluginSetupResult,
    PluginReferencesContext,
    PluginReferencesResult,
} from '@jay-framework/stack-server-runtime';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_STORES_SERVICE_MARKER, type WixStoresService } from './services/wix-stores-service';

const CONFIG_FILE_NAME = '.wix-stores.yaml';

const CONFIG_TEMPLATE = `# Wix Stores Configuration
#
# Category Prefixes (optional):
# Maps root Wix categories to URL prefix slugs.
# Products under a root category get URLs like /products/{prefix}/{product-slug}
# Each prefix gets its own search/listing page and product page templates.
#
# To find category IDs, use: jay-stack action wix-stores/getCategories
#
# categoryPrefixes:
#   - categoryId: "<root-category-id>"
#     prefix: "<url-prefix>"
#     name: "<display-name>"
#   - categoryId: "<another-root-category-id>"
#     prefix: "<another-url-prefix>"
#     name: "<another-display-name>"
`;

export async function setupWixStores(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    // Verify the stores service is available
    try {
        getService(WIX_STORES_SERVICE_MARKER);
    } catch {
        return {
            status: 'error',
            message: 'WixStoresService not available. Run setup for wix-server-client first.',
        };
    }

    // Create config template if it doesn't exist
    const configPath = path.join(ctx.configDir, CONFIG_FILE_NAME);
    const configCreated: string[] = [];

    if (!fs.existsSync(configPath)) {
        if (!fs.existsSync(ctx.configDir)) {
            fs.mkdirSync(ctx.configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
        configCreated.push(`config/${CONFIG_FILE_NAME}`);
    }

    const service = getService(WIX_STORES_SERVICE_MARKER);
    const prefixCount = service.categoryPrefixes.length;
    const message =
        prefixCount > 0
            ? `Wix Stores configured with ${prefixCount} category prefix(es): ${service.categoryPrefixes.map((p) => p.prefix).join(', ')}`
            : 'Wix Stores service verified';

    return {
        status: 'configured',
        message,
        ...(configCreated.length > 0 ? { configCreated } : {}),
    };
}

// ============================================================================
// References handler (jay-stack agent-kit) — generate category tree reference
// ============================================================================

interface CategoryNode {
    _id: string;
    name: string;
    slug: string;
    productCount: number;
    children: CategoryNode[];
}

/**
 * Generate a YAML reference file with the full category tree.
 * Shows all categories with IDs, names, product counts, and parent-child hierarchy.
 */
export async function generateWixStoresReferences(
    ctx: PluginReferencesContext,
): Promise<PluginReferencesResult> {
    if (ctx.initError) {
        throw new Error(`init failed: ${ctx.initError.message}`);
    }

    let storesService: WixStoresService;
    try {
        storesService = getService(WIX_STORES_SERVICE_MARKER) as WixStoresService;
    } catch {
        throw new Error('WixStoresService not available. Run jay-stack setup first.');
    }

    fs.mkdirSync(ctx.referencesDir, { recursive: true });

    // Fetch all visible categories
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allCategories: any[] = [];

    let result = await storesService.categories
        .queryCategories({
            treeReference: { appNamespace: '@wix/stores' },
        })
        .eq('visible', true)
        .limit(100)
        .find();

    allCategories.push(...(result.items || []));

    while (result.hasNext()) {
        result = await result.next();
        allCategories.push(...(result.items || []));
    }

    // Build tree structure
    const nodeMap = new Map<string, CategoryNode>();
    for (const cat of allCategories) {
        if (!cat._id) continue;
        nodeMap.set(cat._id, {
            _id: cat._id,
            name: cat.name || '',
            slug: cat.slug || '',
            productCount: cat.itemCounter || 0,
            children: [],
        });
    }

    const roots: CategoryNode[] = [];
    for (const cat of allCategories) {
        if (!cat._id) continue;
        const node = nodeMap.get(cat._id)!;
        const parentId = cat.parentCategory?._id;
        if (parentId && nodeMap.has(parentId)) {
            nodeMap.get(parentId)!.children.push(node);
        } else {
            roots.push(node);
        }
    }

    // Build prefix info
    const prefixConfig = storesService.categoryPrefixes;
    const configuredPrefixes = prefixConfig.map((p) => ({
        categoryId: p.categoryId,
        prefix: p.prefix,
        name: p.name,
        categoryName: nodeMap.get(p.categoryId)?.name ?? 'unknown',
    }));

    // Write YAML
    const categoriesPath = path.join(ctx.referencesDir, 'categories.yaml');
    fs.writeFileSync(
        categoriesPath,
        yaml.dump(
            {
                _generated: new Date().toISOString(),
                _description:
                    'Wix Stores category tree for agent discovery. Shows category hierarchy, IDs, product counts, and configured URL prefixes.',
                totalCategories: allCategories.length,
                configuredPrefixes: configuredPrefixes.length > 0 ? configuredPrefixes : undefined,
                categoryTree: roots,
            },
            { indent: 2, lineWidth: 120, noRefs: true },
        ),
        'utf-8',
    );

    return {
        referencesCreated: [`agent-kit/references/${ctx.pluginName}/categories.yaml`],
        message: `${allCategories.length} categories (${roots.length} root)`,
    };
}
