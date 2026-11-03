/**
 * Source-editing pointers on materialized wix-data contracts (Design Log #39).
 *
 * Naming matches Jay contract-materializer: prefix + kebab(generator name).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export type DynamicContractPrefix = 'item' | 'list' | 'table' | 'card';

const PREFIX_SUFFIX: Record<DynamicContractPrefix, string> = {
    item: 'Item',
    list: 'List',
    table: 'Table',
    card: 'Card',
};

function toPascalCase(str: string): string {
    return str
        .split(/[-_\s]+/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        .join('');
}

/** Project-root-relative directory for per-contract editing stubs. */
export const EDITING_GUIDES_DIR = 'agent-kit/references/wix-data/editing-guides';

/** Project-root-relative shared CMS editing procedure (copied on agent-kit). */
export const SHARED_EDITING_GUIDE_PATH = 'agent-kit/references/wix-data/wix-data-dashboard-content.md';

/** Plugin-shipped source of the shared guide (for copy into the project). */
export function pluginSharedEditingGuidePath(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.join(here, '..', 'agent-kit', 'designer', 'wix-data-dashboard-content.md');
}

/** Same kebab transform as jay contract-materializer `toKebabCase`. */
export function toKebabCase(str: string): string {
    return str
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');
}

export function generatorContractName(
    prefix: DynamicContractPrefix,
    collectionId: string,
): string {
    return toPascalCase(collectionId) + PREFIX_SUFFIX[prefix];
}

/** Materialized contract name, e.g. `list/recipes-list`. */
export function materializedContractName(
    prefix: DynamicContractPrefix,
    collectionId: string,
): string {
    const name = generatorContractName(prefix, collectionId);
    return `${prefix}/${toKebabCase(name)}`;
}

/** Project-root-relative path to the per-contract editing stub markdown. */
export function editingGuideProjectPath(
    prefix: DynamicContractPrefix,
    collectionId: string,
): string {
    const name = generatorContractName(prefix, collectionId);
    return `${EDITING_GUIDES_DIR}/${prefix}-${toKebabCase(name)}.md`;
}

function yamlScalar(value: string): string {
    if (/[:[\]{}|>&*!%@`#\n]/.test(value) || value.includes('/') || /^\s/.test(value)) {
        return JSON.stringify(value);
    }
    return value;
}

/** Top-level YAML lines inserted after `description` in generated contracts. */
export function sourceEditingContractHeader(
    collectionId: string,
    prefix: DynamicContractPrefix,
): string {
    const guide = editingGuideProjectPath(prefix, collectionId);
    return `collectionId: ${yamlScalar(collectionId)}
editingGuide: ${guide}`;
}

export function editingGuideStubMarkdown(
    materializedName: string,
    collectionId: string,
): string {
    return `# Source editing — ${materializedName}

**Plugin:** \`@jay-framework/wix-data\`  
**Wix CMS collection id:** \`${collectionId}\`  
**Materialized contract:** \`${materializedName}\`

Follow the shared CMS editing procedure: [wix-data-dashboard-content.md](../wix-data-dashboard-content.md)

When following that guide, use **\`${collectionId}\`** as this contract's collection id (also on the \`.jay-contract\` as \`collectionId:\`).
`;
}

export function writeSharedEditingGuideCopy(referencesDir: string): string {
    const dest = path.join(referencesDir, 'wix-data-dashboard-content.md');
    const src = pluginSharedEditingGuidePath();
    fs.mkdirSync(referencesDir, { recursive: true });
    fs.copyFileSync(src, dest);
    return dest;
}

export function writeEditingGuideStub(
    referencesDir: string,
    prefix: DynamicContractPrefix,
    collectionId: string,
): string {
    const materializedName = materializedContractName(prefix, collectionId);
    const guidesDir = path.join(referencesDir, 'editing-guides');
    fs.mkdirSync(guidesDir, { recursive: true });
    const fileName = `${prefix}-${toKebabCase(generatorContractName(prefix, collectionId))}.md`;
    const dest = path.join(guidesDir, fileName);
    fs.writeFileSync(
        dest,
        editingGuideStubMarkdown(materializedName, collectionId),
        'utf-8',
    );
    return dest;
}

export interface CollectionComponentsFlags {
    itemPage?: boolean;
    indexPage?: boolean;
    categoryPage?: boolean;
    tableWidget?: boolean;
    cardWidget?: boolean;
}

/** Write stubs for every dynamic contract this collection will materialize. */
export function writeEditingGuideStubsForCollection(
    referencesDir: string,
    collectionId: string,
    components: CollectionComponentsFlags,
    visible: boolean,
): string[] {
    if (!visible) return [];

    const written: string[] = [];
    if (components.itemPage) {
        written.push(writeEditingGuideStub(referencesDir, 'item', collectionId));
    }
    if (components.indexPage || components.categoryPage) {
        written.push(writeEditingGuideStub(referencesDir, 'list', collectionId));
    }
    if (components.tableWidget) {
        written.push(writeEditingGuideStub(referencesDir, 'table', collectionId));
    }
    if (components.cardWidget) {
        written.push(writeEditingGuideStub(referencesDir, 'card', collectionId));
    }
    return written;
}
