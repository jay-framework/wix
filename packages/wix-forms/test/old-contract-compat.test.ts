// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
    generateElementFile,
    generateElementHydrateFile,
    generateServerElementFile,
    JAY_IMPORT_RESOLVER,
    parseJayFile,
} from '@jay-framework/compiler-jay-html';
import { RuntimeMode } from '@jay-framework/compiler-shared';
import { escapeAttr, escapeHtml } from '@jay-framework/ssr-runtime';
import { buildFormViewState } from '../lib/components/form-view-state.js';
import { FieldRule } from '../lib/components/field-rule.js';
import type { FormFieldView } from '../lib/types.js';

const fixtureDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'fixtures',
    'old-contract',
);

/** The visible fields of the 0.26.1 contact fixture contract. */
const contactFields: FormFieldView[] = [
    {
        target: 'firstName',
        label: 'First name',
        inputType: 'text',
        required: true,
        placeholder: '',
        options: [],
    },
    {
        target: 'email',
        label: 'Email',
        inputType: 'email',
        required: true,
        placeholder: '',
        options: [],
    },
    {
        target: 'message',
        label: 'Message',
        inputType: 'textarea',
        required: false,
        placeholder: '',
        options: [],
    },
    {
        target: 'country',
        label: 'Country',
        inputType: 'select',
        required: false,
        placeholder: '',
        options: [{ value: 'us', label: 'United States' }],
    },
];

async function parsePage() {
    const page = await readFile(path.join(fixtureDir, 'page.jay-html'), 'utf-8');
    return parseJayFile(page, 'page.jay-html', fixtureDir, {}, JAY_IMPORT_RESOLVER, fixtureDir);
}

type ServerRender = (viewState: unknown, context: { write(chunk: string): void }) => void;

/** Transpile the generated server element and evaluate it with the real ssr-runtime helpers. */
function loadServerRender(source: string): ServerRender {
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const module = { exports: {} as Record<string, unknown> };
    const runtimeModules: Record<string, unknown> = {
        '@jay-framework/ssr-runtime': { escapeAttr, escapeHtml },
    };
    const requireRuntime = (name: string) => {
        if (!(name in runtimeModules)) throw new Error(`unexpected runtime import "${name}"`);
        return runtimeModules[name];
    };
    new Function('module', 'exports', 'require', js)(module, module.exports, requireRuntime);
    return module.exports.renderToStream as ServerRender;
}

function renderToString(render: ServerRender, viewState: unknown): string {
    const chunks: string[] = [];
    render(viewState, { write: (chunk) => void chunks.push(chunk) });
    return chunks.join('');
}

/**
 * Regression guard (DL#53 §Backward compatibility ⚠️): a 0.26.1 page whose generated contract
 * has no `errorRule` must keep compiling and rendering when the component's view state now
 * carries an `errorRule` key per field. Green before and after P3.
 */
describe('0.26.1 contract without errorRule (DL#53 §Backward compatibility)', () => {
    const viewState = {
        contact: {
            ...buildFormViewState(contactFields, {
                isSubmitting: false,
                statusMessage: '',
                loadError: '',
                errorByTarget: { email: 'Email is required.' },
                invalidByTarget: { email: true },
            }),
        } as Record<string, any>,
    };
    // Independent of the P3 view-state builder: the key the new component sends, set explicitly.
    viewState.contact.email = { ...viewState.contact.email, errorRule: FieldRule.REQUIRED };

    it('should compile the page for the client, hydration and the server without validations', async () => {
        const parsed = await parsePage();
        expect(parsed.validations).toEqual([]);
        expect(generateElementFile(parsed.val!, RuntimeMode.MainTrusted).validations).toEqual([]);
        expect(
            generateElementHydrateFile(parsed.val!, RuntimeMode.MainTrusted).validations,
        ).toEqual([]);
        expect(generateServerElementFile(parsed.val!).validations).toEqual([]);
    });

    it('should server-render a view state that carries errorRule exactly as the fixture expects', async () => {
        const parsed = await parsePage();
        const render = loadServerRender(generateServerElementFile(parsed.val!).val);
        const expected = await readFile(path.join(fixtureDir, 'expected-render.html'), 'utf-8');

        expect(renderToString(render, viewState)).toEqual(expected.trim());
    });
});
