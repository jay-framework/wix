import type {
    JayHtmlValidatorFn,
    JayHtmlValidationFinding,
    JayHtmlValidationContext,
    DataScope,
} from '@jay-framework/compiler-shared';
import { walkElements, resolveBinding } from '@jay-framework/compiler-shared';
import { parseTemplateParts } from '@jay-framework/compiler-jay-html';

const WIXSTATIC_MEDIA_RE = /static\.wixstatic\.com\/media\//;
const V1_TRANSFORM_RE = /\/v1\//;
const IMAGE_EXTENSIONS_RE = /\.(jpe?g|png|gif|webp|svg|bmp|ico)$/i;

const MEDIA_SRC_ATTRS = ['src', 'poster'];
const MEDIA_ELEMENTS = new Set(['img', 'video', 'source']);

function checkStaticWixUrl(value: string): boolean {
    return WIXSTATIC_MEDIA_RE.test(value) && !V1_TRANSFORM_RE.test(value);
}

function isLocalImagePath(value: string): boolean {
    return value.startsWith('/') && IMAGE_EXTENSIONS_RE.test(value);
}

function resolveBindingWithHeadless(
    bindingPath: string,
    scope: DataScope,
    ctx: JayHtmlValidationContext,
) {
    const resolved = resolveBinding(bindingPath, scope);
    if (resolved.tag) return resolved;

    const segments = bindingPath.split('.');
    if (segments.length < 2) return resolved;

    const headlessKey = segments[0];
    const headless = ctx.headlessImports.find((h) => h.key === headlessKey && h.contract);
    if (!headless?.contract) return resolved;

    const remainingPath = segments.slice(1).join('.');
    const headlessScope: DataScope = { tags: headless.contract.tags };
    return resolveBinding(remainingPath, headlessScope);
}

export const validate: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];

    walkElements(ctx.body, ctx, (el: any, scope: DataScope) => {
        const tagName = el.rawTagName?.toLowerCase();
        if (!tagName || !MEDIA_ELEMENTS.has(tagName)) return;

        for (const attr of MEDIA_SRC_ATTRS) {
            const value = el.getAttribute(attr);
            if (!value) continue;

            const parts = parseTemplateParts(value);
            const isFullyStatic = parts.every((p) => p.kind === 'static');

            if (isFullyStatic) {
                const staticValue = parts.map((p) => p.value).join('');

                if (checkStaticWixUrl(staticValue)) {
                    findings.push({
                        severity: 'error',
                        message:
                            'Wix media URL missing image optimization parameters. See agent-kit/wix-media.md for transformation reference.',
                        element: `<${tagName}>`,
                        attribute: attr,
                    });
                } else if (isLocalImagePath(staticValue)) {
                    findings.push({
                        severity: 'error',
                        message:
                            'Local image reference — upload to Wix Media Manager and use a Wix media URL with optimization parameters. See agent-kit/wix-media.md.',
                        element: `<${tagName}>`,
                        attribute: attr,
                    });
                }
                continue;
            }

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (part.kind !== 'binding') continue;

                const resolved = resolveBindingWithHeadless(part.value, scope, ctx);
                if (resolved.tag?.meta?.mediaType !== 'wix-image') continue;

                const followingStatic = parts
                    .slice(i + 1)
                    .filter((p) => p.kind === 'static')
                    .map((p) => p.value)
                    .join('');

                if (!V1_TRANSFORM_RE.test(followingStatic)) {
                    findings.push({
                        severity: 'error',
                        message: `Image binding '{${part.value}}' produces a Wix media URL but no optimization parameters are applied. See agent-kit/wix-media.md for transformation reference.`,
                        element: `<${tagName}>`,
                        attribute: attr,
                    });
                }
            }
        }
    });

    return findings;
};
