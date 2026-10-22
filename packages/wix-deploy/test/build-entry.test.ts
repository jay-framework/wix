// @vitest-environment node

/**
 * Regression test for DL#36 — BaaS Entry Project Action Registration.
 *
 * Bug: build-entry's generateEntrySource bundled and registered PLUGIN action
 * modules only. Project action modules (manifest actions with isPlugin:false +
 * a serverModule, authored as src/actions/*.actions.ts) were never imported or
 * registered, so on Wix BaaS every POST /_jay/actions/<name> for a project
 * action returned 404 ACTION_NOT_FOUND — while self-hosted serve worked.
 * Found in: design-log/36 - baas-entry-project-action-registration.md
 * Expected: the generated entry imports each project action module by absolute
 *   path AND adds it to the registerActionsFromModules([...]) array.
 * Actual (before fix): neither the import nor the registration entry is emitted.
 */

import { describe, expect, it } from 'vitest';
import {
    collectLocalActionModules,
    findUnbundledProjectActions,
    generateEntrySource,
} from '../lib/commands/build-entry.js';

const PLUGINS = [
    { name: 'wix-server-client', packageName: '@jay-framework/wix-server-client' },
    { name: 'wix-data', packageName: '@jay-framework/wix-data' },
];
const PLUGIN_ACTION_PACKAGES = ['@jay-framework/wix-data'];
const PROJECT_ACTION = {
    relativePath: 'server/actions/submit-contact-form.js',
    absolutePath: '/build/v1.0.0/backend/server/actions/submit-contact-form.js',
};

function generate(
    localActionModules: Array<{ relativePath: string; absolutePath: string }>,
): string {
    return generateEntrySource(
        PLUGINS,
        PLUGIN_ACTION_PACKAGES,
        [],
        'jay-backend-files',
        '/',
        '1.0.0',
        localActionModules,
    );
}

describe('generateEntrySource — project action registration (DL#36)', () => {
    it('imports each project action module by absolute path', () => {
        const source = generate([PROJECT_ACTION]);
        expect(source).toContain(
            `import * as localActions_0 from '${PROJECT_ACTION.absolutePath}';`,
        );
    });

    it('registers each project action module in the registerActionsFromModules array', () => {
        const source = generate([PROJECT_ACTION]);
        expect(source).toContain(
            `{ module: localActions_0, name: '${PROJECT_ACTION.relativePath}' },`,
        );
    });

    it('still registers plugin actions alongside project actions', () => {
        const source = generate([PROJECT_ACTION]);
        // wix-data is plugin index 1 in PLUGINS
        expect(source).toContain(`{ module: pluginModule_1, name: '@jay-framework/wix-data' },`);
    });

    it('emits no project action import or registration when there are none', () => {
        const source = generate([]);
        expect(source).not.toContain('localActions_');
    });
});

describe('collectLocalActionModules — manifest derivation (DL#36)', () => {
    const BUILD_DIR = '/build/v1.0.0/backend';

    it('keeps only non-plugin actions that have a serverModule, resolved to an absolute path', () => {
        const actions = [
            {
                serverModule: '',
                packageName: '@jay-framework/wix-data',
                isPlugin: true,
                actionNames: ['queryItems'],
            },
            {
                serverModule: 'server/actions/submit-contact-form.js',
                isPlugin: false,
                actionNames: ['my-app.submitContactForm'],
            },
        ];
        expect(collectLocalActionModules(actions, BUILD_DIR)).toEqual([
            {
                relativePath: 'server/actions/submit-contact-form.js',
                absolutePath: `${BUILD_DIR}/server/actions/submit-contact-form.js`,
            },
        ]);
    });

    it('excludes non-plugin actions without a serverModule', () => {
        const actions = [{ serverModule: '', isPlugin: false, actionNames: [] }];
        expect(collectLocalActionModules(actions, BUILD_DIR)).toEqual([]);
    });

    it('dedups a module referenced by more than one manifest entry', () => {
        const actions = [
            {
                serverModule: 'server/actions/visits.js',
                isPlugin: false,
                actionNames: ['my-app.requestVisit'],
            },
            {
                serverModule: 'server/actions/visits.js',
                isPlugin: false,
                actionNames: ['my-app.cancelVisit'],
            },
        ];
        expect(collectLocalActionModules(actions, BUILD_DIR)).toEqual([
            {
                relativePath: 'server/actions/visits.js',
                absolutePath: `${BUILD_DIR}/server/actions/visits.js`,
            },
        ]);
    });
});

describe('findUnbundledProjectActions', () => {
    it('names project actions listed without a serverModule', () => {
        const actions = [
            { serverModule: '', isPlugin: false, actionNames: ['my-app.orphan'] },
            {
                serverModule: 'server/actions/visits.js',
                isPlugin: false,
                actionNames: ['my-app.requestVisit'],
            },
            {
                serverModule: '',
                packageName: '@jay-framework/wix-data',
                isPlugin: true,
                actionNames: ['wixData.query'],
            },
        ];
        expect(findUnbundledProjectActions(actions)).toEqual(['my-app.orphan']);
    });
});
