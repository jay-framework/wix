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
# URL templates for link generation.
# Placeholders: {slug} (product), {category} (sub-category), {prefix} (root category)
#
# urls:
#   product: "/products/{slug}"                              # simple (default)
#   product: "/products/{category}/{slug}"                   # with categories
#   product: "/products/{prefix}/{category}/{slug}"          # with prefixes + categories
#   category: "/products/{prefix}/{category}"                # category deep-link pages
#
# Fallback category for pages without category context:
# defaultCategory: "all-products"
#
# To see available categories: jay-stack setup wix-stores (generates category tree reference)

urls:
  product: "/products/{slug}"
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
    const message = `Wix Stores configured (product URL: ${service.urls.product})`;

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
    const allCategories: Array<{
        _id?: string;
        name?: string;
        slug?: string;
        itemCounter?: number;
        parentCategory?: { _id?: string };
    }> = [];

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

    // Write YAML
    const categoriesPath = path.join(ctx.referencesDir, 'categories.yaml');
    fs.writeFileSync(
        categoriesPath,
        yaml.dump(
            {
                _description:
                    'Wix Stores category tree for agent discovery. Shows category hierarchy, IDs, slugs, product counts, and parent-child relationships.',
                totalCategories: allCategories.length,
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
