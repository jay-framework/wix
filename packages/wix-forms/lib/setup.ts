import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
    PluginAgentKitContext,
    PluginAgentKitResult,
    PluginSetupContext,
    PluginSetupResult,
} from '@jay-framework/stack-server-runtime';
import { getService } from '@jay-framework/stack-server-runtime';
import { buildFormAddMenuItems } from './add-menu/form-items.js';
import { copyAiditorAddMenuThumbnails } from './add-menu/copy-aiditor-thumbnails.js';
import { writeGeneratedAddMenuCatalog } from './add-menu/write-add-menu-catalog.js';
import { WIX_FORMS_SERVICE, type WixFormsService } from './services/wix-forms-service-marker.js';

function resolvePackageAgentKitPath(relativePath: string): string {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const fromDist = path.join(thisDir, relativePath);
    if (fs.existsSync(fromDist)) {
        return fromDist;
    }
    return path.join(thisDir, '..', relativePath);
}

export async function setupWixForms(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    try {
        const formsService = getService(WIX_FORMS_SERVICE) as WixFormsService;
        const count = formsService.catalog.forms.length;
        if (count === 0) {
            return {
                status: 'error',
                message:
                    'No usable Wix Forms found on the site. Create forms in the Wix dashboard and add Wix Forms permission to your API key in config/.wix.yaml.',
            };
        }
        return {
            status: 'configured',
            message: `${count} form${count === 1 ? '' : 's'} discovered from Wix API (no manual forms config)`,
        };
    } catch {
        return {
            status: 'error',
            message: 'WixFormsService not available. Run jay-stack setup wix-server-client first.',
        };
    }
}

export async function generateWixFormsAgentKit(
    ctx: PluginAgentKitContext,
): Promise<PluginAgentKitResult> {
    if (ctx.initError) {
        throw new Error(`init failed: ${ctx.initError.message}`);
    }

    let formsService: WixFormsService;
    try {
        formsService = getService(WIX_FORMS_SERVICE) as WixFormsService;
    } catch {
        throw new Error('WixFormsService not available. Run jay-stack setup first.');
    }

    const items = buildFormAddMenuItems(formsService.catalog.forms);
    const addMenuRel = writeGeneratedAddMenuCatalog(ctx.projectRoot, items);
    const thumbnails = copyAiditorAddMenuThumbnails(
        { projectRoot: ctx.projectRoot, force: ctx.force ?? false },
        resolvePackageAgentKitPath,
        'wix-forms',
    );

    const agentKitCreated = [addMenuRel, ...thumbnails];

    return {
        agentKitCreated,
        message: `${items.length} form Add Menu item${items.length === 1 ? '' : 's'}; AIditor @ autocomplete uses the same catalog`,
    };
}

export const setup = setupWixForms;
