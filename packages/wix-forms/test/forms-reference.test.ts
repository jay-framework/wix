// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { buildFormsReference } from '../lib/generators/forms-reference.js';
import type { ListedFormView } from '../lib/types.js';

const fixtureDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'fixtures',
    'forms-reference',
);

describe('buildFormsReference (agent-kit forms.yaml)', () => {
    /**
     * Gap: tags derived from Wix auto-generated targets are unreadable (firstName_5820,
     * formFieldAa5f for "I agree to be contacted") and forms.yaml listed only the target.
     * Found in: QA run 2026-11-10 (FEEDBACK #13).
     * Expected: each field shows its contract tag beside its label, and each form maps
     * label → tag, so an agent finds the tag from the label it sees on the page.
     */
    it('should list each field tag beside its label and map labels to tags', async () => {
        const [forms, expected] = await Promise.all([
            readFile(path.join(fixtureDir, 'listed-forms.json'), 'utf-8'),
            readFile(path.join(fixtureDir, 'expected-forms.yaml'), 'utf-8'),
        ]);

        const reference = buildFormsReference(
            JSON.parse(forms) as ListedFormView[],
            'wix.form_app.form',
        );

        expect(reference).toEqual(yaml.load(expected));
    });
});
