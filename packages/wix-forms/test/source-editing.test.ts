import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
    SHARED_EDITING_GUIDE_PATH,
    sourceEditingContractHeader,
    writeEditingGuideCopies,
} from '../lib/source-editing.js';

/**
 * Bug: the shared forms editing guide copied into a project links to
 *   `agent-kit/plugin/user-visible-messages.md`, which exists only inside the
 *   plugin package — an agent following the guide hits a missing file.
 * Found in: review of the per-form source-editing guide (DL #40).
 * Expected: every `agent-kit/….md` path in the copied guides exists in the project.
 * Actual: user-visible-messages.md is not copied, so its links dangle.
 */
describe('wix-forms editing guide copies', () => {
    it('should only link to agent-kit files that exist in the project', () => {
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wix-forms-guides-'));
        const referencesDir = path.join(projectRoot, 'agent-kit', 'references', 'wix-forms');

        writeEditingGuideCopies(referencesDir);

        const copiedGuides = fs
            .readdirSync(referencesDir)
            .map((name) => path.join(referencesDir, name));
        const linkedPaths = copiedGuides.flatMap((guide) =>
            [...fs.readFileSync(guide, 'utf-8').matchAll(/agent-kit\/[\w/.-]+\.md/g)].map(
                (m) => m[0],
            ),
        );
        const missing = linkedPaths.filter(
            (linked) => !fs.existsSync(path.join(projectRoot, linked)),
        );

        expect(linkedPaths.length).toBeGreaterThan(0);
        expect(missing).toEqual([]);
    });
});

describe('wix-forms source-editing contract header (DL#39)', () => {
    it('emits formId and the shared forms editingGuide path', () => {
        expect(sourceEditingContractHeader('f1a2b3')).toEqual(
            `formId: f1a2b3\neditingGuide: ${SHARED_EDITING_GUIDE_PATH}`,
        );
    });

    it('quotes form ids that need YAML escaping', () => {
        expect(sourceEditingContractHeader('form:id/with/slashes')).toEqual(
            `formId: "form:id/with/slashes"\neditingGuide: ${SHARED_EDITING_GUIDE_PATH}`,
        );
    });
});
