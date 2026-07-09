/**
 * Generate Add Menu items for indexed Wix Stores categories (Design Log #19 / #20 M19.2).
 */

import type { WixStoresConfig } from '../config-loader.js';

/** Static wix-stores contracts ship in node_modules — not materialized-contracts/. */
export function wixStoresStaticContractPath(contractName: string): string {
    return `node_modules/@jay-framework/wix-stores/dist/contracts/${contractName}.jay-contract`;
}

export interface CategoryTreeNode {
    _id: string;
    name: string;
    slug: string;
    productCount: number;
    children: CategoryTreeNode[];
}

export interface CategoryAddMenuItem {
    id: string;
    title: string;
    category: string;
    subCategory: string;
    pluginName: string;
    packageName: string;
    prompt: string;
}

export interface FlatCategoryEntry {
    node: CategoryTreeNode;
    /** Root → … → parent names (excludes current). */
    breadcrumbNames: string[];
    /** Root → … → parent slugs (excludes current). */
    breadcrumbSlugs: string[];
    rootSlug: string;
    /** Display name of the tree root (same for root and all descendants). */
    rootName: string;
    /** True when the tree root has child categories (hierarchical branch). */
    rootHasChildren: boolean;
    parentSlug: string | null;
}

/** Depth-first flatten of the category tree for one Add Menu item per category. */
export function flattenCategoryTree(
    roots: CategoryTreeNode[],
    parentNames: string[] = [],
    parentSlugs: string[] = [],
    rootSlug: string | null = null,
    rootName: string | null = null,
    rootHasChildren: boolean | null = null,
): FlatCategoryEntry[] {
    const entries: FlatCategoryEntry[] = [];

    for (const node of roots) {
        const entryRootSlug = rootSlug ?? node.slug;
        const entryRootName = rootName ?? node.name;
        const entryRootHasChildren = rootHasChildren ?? node.children.length > 0;
        entries.push({
            node,
            breadcrumbNames: parentNames,
            breadcrumbSlugs: parentSlugs,
            rootSlug: entryRootSlug,
            rootName: entryRootName,
            rootHasChildren: entryRootHasChildren,
            parentSlug: parentSlugs.length > 0 ? parentSlugs[parentSlugs.length - 1]! : null,
        });

        if (node.children.length > 0) {
            entries.push(
                ...flattenCategoryTree(
                    node.children,
                    [...parentNames, node.name],
                    [...parentSlugs, node.slug],
                    entryRootSlug,
                    entryRootName,
                    entryRootHasChildren,
                ),
            );
        }
    }

    return entries;
}

function sanitizeIdSegment(slug: string, categoryId: string): string {
    const sanitized = slug
        .trim()
        .replace(/[^\w-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (sanitized.length > 0) {
        return sanitized.slice(0, 64);
    }
    return categoryId.slice(0, 8);
}

function uniqueCategoryItemId(slug: string, categoryId: string, usedIds: Set<string>): string {
    const base = sanitizeIdSegment(slug, categoryId);
    let id = `wix-stores:category:${base}`;
    let suffix = 2;
    while (usedIds.has(id)) {
        id = `wix-stores:category:${base}-${suffix++}`;
    }
    usedIds.add(id);
    return id;
}

function formatCategoryTitle(entry: FlatCategoryEntry): string {
    const { node, breadcrumbNames, rootSlug } = entry;
    if (breadcrumbNames.length === 0) {
        return `Category — ${node.name}`;
    }
    const rootLabel = rootSlug !== node.slug ? ` (${rootSlug})` : '';
    const path = [...breadcrumbNames, node.name].join(' › ');
    return `Category — ${path}${rootLabel}`;
}

function resolveExampleCategoryUrl(
    config: WixStoresConfig,
    entry: FlatCategoryEntry,
): string | null {
    const template = config.urls.category;
    if (!template) {
        return null;
    }

    let url = template;
    if (url.includes('{prefix}')) {
        url = url.replace('{prefix}', entry.rootSlug);
    }
    if (url.includes('{category}')) {
        url = url.replace('{category}', entry.node.slug);
    }
    return url;
}

function buildCategoryPrompt(config: WixStoresConfig, entry: FlatCategoryEntry): string {
    const { node, breadcrumbNames, breadcrumbSlugs, rootSlug, parentSlug } = entry;
    const hierarchyPath =
        breadcrumbNames.length > 0 ? [...breadcrumbNames, node.name].join(' > ') : node.name;

    const lines = [
        `Scope this request to Wix Stores category "${node.name}".`,
        '',
        'Category facts (from agent-kit/references/wix-stores/categories.yaml):',
        `  Category ID: ${node._id}`,
        `  Category slug: ${node.slug}`,
        `  Product count: ${node.productCount}`,
        `  Hierarchy: ${hierarchyPath}`,
    ];

    if (parentSlug) {
        lines.push(`  Parent category slug: ${parentSlug}`);
    }
    if (rootSlug && rootSlug !== node.slug) {
        lines.push(`  Root / prefix category slug: ${rootSlug}`);
    }

    const exampleUrl = resolveExampleCategoryUrl(config, entry);
    if (exampleUrl) {
        lines.push(`  Example category URL (config/.wix-stores.yaml): ${exampleUrl}`);
    }

    lines.push(
        '',
        'Full indexed category tree: agent-kit/references/wix-stores/categories.yaml',
        '',
        'Common headless bindings for this category:',
        `  product-search — filter by category slug via jay-params, e.g. category="${node.slug}"${
            rootSlug !== node.slug ? `; prefix="${rootSlug}" when URL template uses {prefix}` : ''
        }`,
    );

    if (parentSlug) {
        lines.push(
            `  category-list — show direct children with parentCategory="${parentSlug}"; this category's children use parentCategory="${node.slug}"`,
        );
    } else {
        lines.push(
            `  category-list — show top-level categories (no parentCategory), or children with parentCategory="${node.slug}"`,
        );
    }

    lines.push(
        `  category-products — pass categorySlug="${node.slug}" to show products from this category; optionally pass productId to exclude a product`,
        '',
        'Contracts:',
        `  ${wixStoresStaticContractPath('product-search')}`,
        `  ${wixStoresStaticContractPath('category-list')}`,
        `  ${wixStoresStaticContractPath('category-products')}`,
        '  Related products on a product page: agent-kit/designer/related-products.md',
        '',
        'Bind ViewState and refs per agent-kit/designer/INSTRUCTIONS.md.',
    );

    if (config.defaultCategory) {
        lines.push(
            '',
            `Project defaultCategory (fallback when no category context): ${config.defaultCategory}`,
        );
    }

    return lines.join('\n');
}

function resolveCategorySubCategory(entry: FlatCategoryEntry): string {
    if (entry.rootHasChildren) {
        return entry.rootName;
    }
    return 'Categories';
}

/** Build Add Menu catalog items — one per visible category in the indexed tree. */
export function buildCategoryAddMenuItems(
    roots: CategoryTreeNode[],
    config: WixStoresConfig,
): CategoryAddMenuItem[] {
    const usedIds = new Set<string>();
    const entries = flattenCategoryTree(roots);

    return entries.map((entry) => ({
        id: uniqueCategoryItemId(entry.node.slug, entry.node._id, usedIds),
        title: formatCategoryTitle(entry),
        category: 'Store',
        subCategory: resolveCategorySubCategory(entry),
        pluginName: 'wix-stores',
        packageName: '@jay-framework/wix-stores',
        prompt: buildCategoryPrompt(config, entry),
    }));
}
