/**
 * Source-editing pointers on materialized wix-forms contracts (wix DL #39, post DL #40).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const PROJECT_REFERENCES_DIR = 'agent-kit/references/wix-forms';

/** Project-root-relative shared forms editing procedure (copied on agent-kit). */
export const SHARED_EDITING_GUIDE_PATH = `${PROJECT_REFERENCES_DIR}/wix-forms-dashboard-content.md`;

/** Project-root-relative guide to who owns each visitor-facing string (copied on agent-kit). */
export const USER_VISIBLE_MESSAGES_GUIDE_PATH = `${PROJECT_REFERENCES_DIR}/user-visible-messages.md`;

/**
 * Plugin-shipped guides copied into the project, relative to the plugin's `agent-kit/`.
 * The copies link to each other by their project paths, so they are always copied together.
 */
const COPIED_GUIDES = [
    'designer/wix-forms-dashboard-content.md',
    'plugin/user-visible-messages.md',
];

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

/** Copies the editing guides into the project's wix-forms references; returns the written paths. */
export function writeEditingGuideCopies(referencesDir: string): string[] {
    fs.mkdirSync(referencesDir, { recursive: true });
    return COPIED_GUIDES.map((guide) => {
        const dest = path.join(referencesDir, path.basename(guide));
        fs.copyFileSync(path.join(pluginAgentKitDir(), guide), dest);
        return dest;
    });
}

function pluginAgentKitDir(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.join(here, '..', 'agent-kit');
}
