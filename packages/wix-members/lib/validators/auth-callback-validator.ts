import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadWixMembersConfig } from '../config-loader.js';

const checkedProjects = new Set<string>();

export const validate: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];

    const usesMembers = ctx.headlessImports.some((imp) => imp.plugin === 'wix-members');
    if (!usesMembers) return findings;

    if (checkedProjects.has(ctx.projectRoot)) return findings;
    checkedProjects.add(ctx.projectRoot);

    const config = loadWixMembersConfig(ctx.projectRoot);
    const callbackUrl = config.authCallbackUrl;

    if (!callbackUrl.startsWith('/')) return findings;

    const routeSegments = callbackUrl.replace(/^\//, '').split('/');
    const pagesDir = path.join(ctx.projectRoot, 'src', 'pages');
    const pagePath = path.join(pagesDir, ...routeSegments, 'page.jay-html');

    if (!fs.existsSync(pagePath)) {
        findings.push({
            severity: 'error',
            message: `wix-members requires an auth callback page at src/pages/${routeSegments.join('/')}/page.jay-html`,
            suggestion:
                'Create the page using the auth-callback contract. See agent-kit/plugin/wix-members-setup.md for a template.',
        });
    }

    return findings;
};
