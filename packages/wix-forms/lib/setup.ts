import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type {
    PluginSetupContext,
    PluginSetupResult,
    PluginAgentKitContext,
    PluginAgentKitResult,
} from '@jay-framework/stack-server-runtime';
import { getService } from '@jay-framework/stack-server-runtime';
import { DEFAULT_FORMS_NAMESPACE } from './config-loader.js';
import { WIX_FORMS_SERVICE, type WixFormsService } from './services/wix-forms-service-marker.js';
import { computeFormSlugs } from './generators/form-slug.js';
import { elementTypeFor } from './generators/contract-utils.js';

const CONFIG_FILE = '.wix-forms.yaml';

// Per-form contracts are auto-generated for every enabled form in the namespace (DL#38).
// All config is an OPTIONAL filter/override — absent config generates every form.
const CONFIG_TEMPLATE = `# Wix Forms configuration (optional).
#
# Per-form contracts are generated for every enabled form in the namespace.
# Everything below is an optional filter/override — delete the file to use defaults.

# List Forms namespace (default shown). Standalone Wix Forms use this namespace.
namespace: "${DEFAULT_FORMS_NAMESPACE}"

# Restrict generation to these form ids (empty = all forms in the namespace).
formIds: []

# Which forms to generate: enabled | disabled | all
include: enabled
`;

// ============================================================================
// Setup handler (jay-stack setup) — config only
// ============================================================================

export async function setupWixForms(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    const configCreated: string[] = [];
    const configPath = path.join(ctx.configDir, CONFIG_FILE);
    if (!fs.existsSync(configPath)) {
        if (!fs.existsSync(ctx.configDir)) {
            fs.mkdirSync(ctx.configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
        configCreated.push(`config/${CONFIG_FILE}`);
    }

    return {
        status: 'configured',
        configCreated,
        message: `Wix Forms configured. Per-form contracts are generated at agent-kit time from namespace "${DEFAULT_FORMS_NAMESPACE}" (override in config/${CONFIG_FILE}).`,
    };
}

export const setup = setupWixForms;

// ============================================================================
// Agent-kit handler (jay-stack agent-kit) — form discovery reference
// ============================================================================

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

    const forms = await formsService.listForms();
    const slugById = computeFormSlugs(forms);

    const formSummaries = forms.map((form) => ({
        contract: `form/${slugById.get(form.id)}`,
        formId: form.id,
        name: form.name,
        fields: form.fields.map((field) => ({
            target: field.target,
            label: field.label,
            type: field.inputType,
            required: field.required,
            elementType: elementTypeFor(field),
        })),
    }));

    fs.mkdirSync(ctx.referencesDir, { recursive: true });
    const formsPath = path.join(ctx.referencesDir, 'forms.yaml');
    fs.writeFileSync(
        formsPath,
        yaml.dump(
            {
                _generated: new Date().toISOString(),
                _description:
                    'Wix Forms per-form contracts for agent discovery (DL#38). ' +
                    'Bind explicit field tags, e.g. {contact.email.label}, ref="contact.email.input".',
                namespace: formsService.config.namespace,
                totalForms: formSummaries.length,
                forms: formSummaries,
            },
            { indent: 2, lineWidth: 120, noRefs: true },
        ),
        'utf-8',
    );

    return {
        agentKitCreated: [`agent-kit/references/${ctx.pluginName}/forms.yaml`],
        message: `${formSummaries.length} forms discovered in namespace "${formsService.config.namespace}"`,
    };
}
