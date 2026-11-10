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

interface CompiledFragment {
    validations: string[];
    code: string;
}

/** Parses AND generates: body bindings resolve only during generation. */
async function compileFragment(fragment: string): Promise<CompiledFragment> {
    const parsed = await parseJayFile(
        pageAround(fragment),
        'page.jay-html',
        contractDir,
        {},
        JAY_IMPORT_RESOLVER,
        contractDir,
    );
    if (!parsed.val) return { validations: parsed.validations, code: '' };
    const generated = generateElementFile(parsed.val, RuntimeMode.MainTrusted);
    return {
        validations: [...parsed.validations, ...generated.validations],
        code: generated.val ?? '',
    };
}

async function compileValidations(fragment: string): Promise<string[]> {
    return (await compileFragment(fragment)).validations;
}

function readFixture(name: string): Promise<string> {
    return readFile(path.join(fixturesDir, 'checkbox-chips', name), 'utf-8');
}

function readGuide(): Promise<string> {
    return readFile(
        path.join(fixturesDir, '..', '..', 'agent-kit', 'plugin', 'rich-forms.md'),
        'utf-8',
    );
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

    /**
     * Bug: the §4b chip example rendered every chip checked in the browser.
     * Found in: QA run 2026-11-10 (DL#44 Implementation Results, QA addendum).
     * Expected: `checked` is a boolean condition on the option's `selected`
     *   (`checked: ba(vs1 => vs1.selected)`), so an unselected chip has no attribute.
     * Actual: `checked="{selected}"` compiled to a string attribute (`dp(...)`), rendering
     *   `checked="false"` (= checked). Its fix, `checked="selected"`, compiles to the literal
     *   string `'selected'` until jay adds `checked` to its boolean attributes — this test
     *   stays red until that jay fix is synced in.
     */
    it('should compile checked as a boolean condition on the option, not a string attribute', async () => {
        const { code } = await compileFragment(await readFixture('chip-group.jay-html.fragment'));
        // jay applies `checked` as a DOM property driven by the condition, so it follows the
        // ViewState after a click (jay DL #235); a string attribute would render `checked="false"`.
        expect(code).toMatch(/checked: dp\(vs1 => vs1\.selected\)/);
    });
});

describe('rich-forms.md §4b <select multiple> example (DL#41)', () => {
    it('should compile against the choices contract without errors', async () => {
        const select = await readFixture('select-multiple.jay-html.fragment');
        expect(await compileValidations(select)).toEqual([]);
    });

    it('should be the example the guide shows, verbatim', async () => {
        const [select, guide] = await Promise.all([
            readFixture('select-multiple.jay-html.fragment'),
            readGuide(),
        ]);
        expect(guide).toContain(select.trim());
    });

    /**
     * Bug: `selected="{selected}"` rendered `selected="false"` (= selected) on every option.
     * Found in: QA run 2026-11-10 (DL#41 Implementation Results, QA addendum).
     * Expected: `selected` is a boolean condition on the option's `selected`.
     */
    it('should compile selected as a boolean condition on the option, not a string attribute', async () => {
        const { code } = await compileFragment(
            await readFixture('select-multiple.jay-html.fragment'),
        );
        expect(code).toMatch(/selected: ba\(vs1 => vs1\.selected\)/);
    });
});
