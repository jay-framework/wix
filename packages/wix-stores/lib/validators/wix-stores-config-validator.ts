import type {
    JayHtmlValidatorFn,
    JayHtmlValidationFinding,
    JayHtmlValidationContext,
} from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WIX_STORES_CONFIG_FILE_NAME } from '../config-loader.js';
import { validateWixStoresConfig } from '../validate-config.js';

const validatedProjects = new Set<string>();

function pageUsesWixStoresV3(ctx: JayHtmlValidationContext): boolean {
    let usesV3 = false;
    walkElements(ctx.body, ctx, (element) => {
        if (usesV3) {
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
        if (pluginAttr.includes('wix-stores-v1')) {
            return;
        }
        if (/wix-stores/.test(pluginAttr)) {
            usesV3 = true;
        }
    });
    return usesV3;
}

function toFindings(
    issues: ReturnType<typeof validateWixStoresConfig>,
): JayHtmlValidationFinding[] {
    return issues.map((issue) => ({
        severity: issue.severity,
        message: issue.message,
        ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
    }));
}

export const validateWixStoresProjectConfig: JayHtmlValidatorFn = (ctx) => {
    if (validatedProjects.has(ctx.projectRoot)) {
        return [];
    }

    const configPath = path.join(ctx.projectRoot, 'config', WIX_STORES_CONFIG_FILE_NAME);
    const configExists = fs.existsSync(configPath);
    const usesV3 = pageUsesWixStoresV3(ctx);

    if (!configExists && !usesV3) {
        return [];
    }

    validatedProjects.add(ctx.projectRoot);

    if (!configExists) {
        return [
            {
                severity: 'warning',
                message:
                    'This page uses @jay-framework/wix-stores but config/.wix-stores.yaml is missing.',
                suggestion: 'Run jay-stack setup wix-stores to create the config template.',
            },
        ];
    }

    return toFindings(validateWixStoresConfig(ctx.projectRoot));
};
