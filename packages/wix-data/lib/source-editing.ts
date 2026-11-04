/**
 * Source-editing pointers on materialized wix-data contracts (Design Log #39).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export type DynamicContractPrefix = 'item' | 'list' | 'table' | 'card';

/** Project-root-relative shared CMS editing procedure (copied on agent-kit). */
export const SHARED_EDITING_GUIDE_PATH = 'agent-kit/references/wix-data/wix-data-dashboard-content.md';

/** Plugin-shipped source of the shared guide (for copy into the project). */
export function pluginSharedEditingGuidePath(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.join(here, '..', 'agent-kit', 'designer', 'wix-data-dashboard-content.md');
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
