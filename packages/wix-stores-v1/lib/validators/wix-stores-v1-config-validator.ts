import type {
    JayHtmlValidatorFn,
    JayHtmlValidationFinding,
    JayHtmlValidationContext,
} from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WIX_STORES_V1_CONFIG_FILE_NAME } from '../config-loader.js';
import { validateWixStoresV1Config } from '../validate-config.js';

const WIX_STORES_V1_PLUGIN_RE = /wix-stores-v1/;
const validatedProjects = new Set<string>();

function pageUsesWixStoresV1(ctx: JayHtmlValidationContext): boolean {
    let usesV1 = false;
    walkElements(ctx.body, ctx, (element) => {
        if (usesV1) {
            return;
        }
        const tagName = element.rawTagName?.toLowerCase();
        if (tagName !== 'script') {
            return;
        }
        if (element.getAttribute('type') !== 'application/jay-headless') {
            return;
        }
        const pluginAttr = element.getAttribute('plugin') ?? '';
        if (WIX_STORES_V1_PLUGIN_RE.test(pluginAttr)) {
            usesV1 = true;
        }
    });
    return usesV1;
}

function toFindings(
    issues: ReturnType<typeof validateWixStoresV1Config>,
): JayHtmlValidationFinding[] {
    return issues.map((issue) => ({
        severity: issue.severity,
        message: issue.message,
        ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
    }));
}

export const validateWixStoresV1ProjectConfig: JayHtmlValidatorFn = (ctx) => {
    if (validatedProjects.has(ctx.projectRoot)) {
        return [];
    }

    const configPath = path.join(ctx.projectRoot, 'config', WIX_STORES_V1_CONFIG_FILE_NAME);
    const configExists = fs.existsSync(configPath);
    const usesV1 = pageUsesWixStoresV1(ctx);

    if (!configExists && !usesV1) {
        return [];
    }

    validatedProjects.add(ctx.projectRoot);

    if (!configExists) {
        return [
            {
                severity: 'warning',
                message:
                    'This page uses @jay-framework/wix-stores-v1 but config/.wix-stores-v1.yaml is missing.',
                suggestion: 'Run jay-stack setup wix-stores-v1 to create the config template.',
            },
        ];
    }

    return toFindings(validateWixStoresV1Config(ctx.projectRoot));
};
