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

function yamlScalar(value: string): string {
    if (/[:[\]{}|>&*!%@`#\n]/.test(value) || value.includes('/') || /^\s/.test(value)) {
        return JSON.stringify(value);
    }
    return value;
}

/** Top-level YAML lines inserted after `description` in generated contracts. */
export function sourceEditingContractHeader(
    collectionId: string,
    _prefix: DynamicContractPrefix,
): string {
    return `collectionId: ${yamlScalar(collectionId)}
editingGuide: ${SHARED_EDITING_GUIDE_PATH}`;
}

export function writeSharedEditingGuideCopy(referencesDir: string): string {
    const dest = path.join(referencesDir, 'wix-data-dashboard-content.md');
    const src = pluginSharedEditingGuidePath();
    fs.mkdirSync(referencesDir, { recursive: true });
    fs.copyFileSync(src, dest);
    return dest;
}
