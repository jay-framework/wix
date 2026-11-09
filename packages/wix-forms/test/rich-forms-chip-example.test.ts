// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    generateElementFile,
    JAY_IMPORT_RESOLVER,
    parseJayFile,
} from '@jay-framework/compiler-jay-html';
import { RuntimeMode } from '@jay-framework/compiler-shared';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const contractDir = path.join(fixturesDir, 'form-contract-generator');

/** The guide snippet is a fragment; jay compiles only a full document. */
function pageAround(fragment: string): string {
    return `<html>
<head>
  <script type="application/jay-data">
data:
  </script>
  <script type="application/jay-headless" contract="./choices.jay-contract" key="contact"></script>
</head>
<body>
${fragment}
</body>
</html>`;
}

/** Validations from parsing AND generating: body bindings resolve only during generation. */
async function compileValidations(fragment: string): Promise<string[]> {
    const parsed = await parseJayFile(
        pageAround(fragment),
        'page.jay-html',
        contractDir,
        {},
        JAY_IMPORT_RESOLVER,
        contractDir,
    );
    if (!parsed.val) return parsed.validations;
    return [
        ...parsed.validations,
        ...generateElementFile(parsed.val, RuntimeMode.MainTrusted).validations,
    ];
}

describe('rich-forms.md §4b checkbox-chip example (DL#44 Phase 5)', () => {
    it('should compile against the choices contract without errors', async () => {
        const chipGroup = await readFile(
            path.join(fixturesDir, 'checkbox-chips', 'chip-group.jay-html.fragment'),
            'utf-8',
        );
        expect(await compileValidations(chipGroup)).toEqual([]);
    });

    it('should be the example the guide shows, verbatim', async () => {
        const [chipGroup, guide] = await Promise.all([
            readFile(
                path.join(fixturesDir, 'checkbox-chips', 'chip-group.jay-html.fragment'),
                'utf-8',
            ),
            readFile(
                path.join(fixturesDir, '..', '..', 'agent-kit', 'plugin', 'rich-forms.md'),
                'utf-8',
            ),
        ]);
        expect(guide).toContain(chipGroup.trim());
    });

    it('should reject a field binding inside forEach over options without $parent.', async () => {
        const chipGroup = await readFile(
            path.join(fixturesDir, 'checkbox-chips', 'chip-group.jay-html.fragment'),
            'utf-8',
        );
        const withoutParent = chipGroup.replace(
            '$parent.contact.interests.invalid',
            'contact.interests.invalid',
        );
        expect(await compileValidations(withoutParent)).toContain(
            'the data field [contact.interests.invalid] not found in Jay data',
        );
    });
});
