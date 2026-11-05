/**
 * Source-editing pointers on materialized wix-forms contracts (wix DL #39, post DL #40).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/** Project-root-relative shared forms editing procedure (copied on agent-kit). */
export const SHARED_EDITING_GUIDE_PATH =
    'agent-kit/references/wix-forms/wix-forms-dashboard-content.md';

/** Plugin-shipped source of the shared guide (for copy into the project). */
export function pluginSharedEditingGuidePath(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.join(here, '..', 'agent-kit', 'designer', 'wix-forms-dashboard-content.md');
}

function yamlScalar(value: string): string {
    if (/[:[\]{}|>&*!%@`#\n]/.test(value) || value.includes('/') || /^\s/.test(value)) {
        return JSON.stringify(value);
    }
    return value;
}

/** Top-level YAML lines inserted after `description` in generated contracts. */
export function sourceEditingContractHeader(formId: string): string {
    return `formId: ${yamlScalar(formId)}
editingGuide: ${SHARED_EDITING_GUIDE_PATH}`;
}

export function writeSharedEditingGuideCopy(referencesDir: string): string {
    const dest = path.join(referencesDir, 'wix-forms-dashboard-content.md');
    const src = pluginSharedEditingGuidePath();
    fs.mkdirSync(referencesDir, { recursive: true });
    fs.copyFileSync(src, dest);
    return dest;
}
