// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    SHARED_EDITING_GUIDE_PATH,
    sourceEditingContractHeader,
    writeSharedEditingGuideCopy,
} from '../lib/source-editing.js';

const pluginGuidePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'agent-kit',
    'designer',
    'wix-forms-dashboard-content.md',
);

describe('wix-forms source-editing (DL#40)', () => {
    it('emits the formId and the shared forms editingGuide path', () => {
        expect(sourceEditingContractHeader('e87b4d6f-6a0f-4b5b-b730-63b9fa236f35')).toEqual(
            'formId: e87b4d6f-6a0f-4b5b-b730-63b9fa236f35\n' +
                'editingGuide: agent-kit/references/wix-forms/wix-forms-dashboard-content.md',
        );
    });

    it('copies the plugin guide to the path every contract points at', () => {
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wix-forms-guide-'));
        const referencesDir = path.join(projectRoot, 'agent-kit', 'references', 'wix-forms');

        writeSharedEditingGuideCopy(referencesDir);

        expect(fs.readFileSync(path.join(projectRoot, SHARED_EDITING_GUIDE_PATH), 'utf-8')).toEqual(
            fs.readFileSync(pluginGuidePath, 'utf-8'),
        );
    });
});
