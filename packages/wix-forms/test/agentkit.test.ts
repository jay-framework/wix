// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { load as loadYaml } from 'js-yaml';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { generateWixFormsAgentKit } from '../lib/setup.js';
import type { WixFormsService } from '../lib/services/wix-forms-service-marker.js';

vi.mock('@jay-framework/stack-server-runtime', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@jay-framework/stack-server-runtime')>();
    return {
        ...actual,
        getService: vi.fn(),
    };
});

import { getService } from '@jay-framework/stack-server-runtime';

function mockFormsService(): WixFormsService {
    return {
        catalog: {
            forms: [
                {
                    formId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                    title: 'Contact us',
                    contractName: 'ContactUsForm',
                    contractSlug: 'contact-us-form',
                },
            ],
        },
        getFormFields: vi.fn(),
        getFormDisplayName: vi.fn(),
        getFormSummaryFields: vi.fn(),
        createSubmission: vi.fn(),
    };
}

function makeCtx(projectRoot: string) {
    return {
        projectRoot,
        pluginName: 'wix-forms',
        force: true,
        referencesDir: join(projectRoot, 'agent-kit/references/wix-forms'),
    };
}

describe('generateWixFormsAgentKit', () => {
    let projectRoot: string;

    it('should write wix-forms.generated.yaml Add Menu catalog', async () => {
        projectRoot = mkdtempSync(join(tmpdir(), 'wix-forms-agentkit-'));
        vi.mocked(getService).mockReturnValue(mockFormsService());

        const result = await generateWixFormsAgentKit(makeCtx(projectRoot));
        const addMenuPath = join(projectRoot, 'agent-kit/aiditor/add-menu/wix-forms.generated.yaml');

        expect(addMenuPath).toEqual(join(projectRoot, 'agent-kit/aiditor/add-menu/wix-forms.generated.yaml'));
        expect(result.agentKitCreated).toEqual(
            expect.arrayContaining(['agent-kit/aiditor/add-menu/wix-forms.generated.yaml']),
        );

        const catalog = loadYaml(readFileSync(addMenuPath, 'utf-8')) as {
            items: Array<{ id: string; prompt: string; interaction: { mode: string } }>;
        };
        expect(catalog.items).toHaveLength(1);
        expect(catalog.items[0]?.id).toBe('wix-forms:form:a1b2c3d4-e5f6-7890-abcd-ef1234567890');
        expect(catalog.items[0]?.interaction.mode).toBe('stage-place');
        expect(catalog.items[0]?.prompt).toEqual(
            expect.stringContaining('agent-kit/materialized-contracts/wix-forms/form-contact-us-form.jay-contract'),
        );
        expect(catalog.items[0]?.prompt).toEqual(expect.stringContaining('forEach="contactus.fields"'));

        rmSync(projectRoot, { recursive: true, force: true });
    });
});
