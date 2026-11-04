/**
 * Source-editing pointers on materialized per-form contracts (DL#40, same shape as
 * wix-data's materialized contract editing guides — Design Log #39).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GUIDE_FILE_NAME = 'wix-forms-dashboard-content.md';

/** Project-root-relative shared forms editing procedure (copied on agent-kit). */
export const SHARED_EDITING_GUIDE_PATH = `agent-kit/references/wix-forms/${GUIDE_FILE_NAME}`;

/** Top-level YAML lines inserted after `description` in generated form contracts. */
export function sourceEditingContractHeader(formId: string): string {
    return `formId: ${formId}
editingGuide: ${SHARED_EDITING_GUIDE_PATH}`;
}

export function writeSharedEditingGuideCopy(referencesDir: string): void {
    fs.mkdirSync(referencesDir, { recursive: true });
    fs.copyFileSync(pluginSharedEditingGuidePath(), path.join(referencesDir, GUIDE_FILE_NAME));
}

function pluginSharedEditingGuidePath(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.join(here, '..', 'agent-kit', 'designer', GUIDE_FILE_NAME);
}
