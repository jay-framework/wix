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

const SRCSET_UNENCODED_COMMA_RE = /\/v1\/[^/]+\/[^/]*[a-z]_\d+,[a-z]_\d+/;

const MEDIA_SRC_ATTRS = ['src', 'poster'];
const MEDIA_SRCSET_ATTRS = ['srcset'];
const MEDIA_ELEMENTS = new Set(['img', 'video', 'source']);

function checkStaticWixUrl(value: string): boolean {
    return WIXSTATIC_MEDIA_RE.test(value) && !V1_TRANSFORM_RE.test(value);
}

function isLocalImagePath(value: string): boolean {
    if (!IMAGE_EXTENSIONS_RE.test(value)) return false;
    if (value.startsWith('http://') || value.startsWith('https://')) return false;
    return true;
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
                        message: `Local image reference '${staticValue}' — run \`jay-stack-cli run wix-media/upload-public\` to upload local images to Wix Media Manager, then use the Wix media URL with optimization parameters. See agent-kit/wix-media.md.`,
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

        for (const attr of MEDIA_SRCSET_ATTRS) {
            const value = el.getAttribute(attr);
            if (!value) continue;

            const parts = parseTemplateParts(value);
            for (const part of parts) {
                if (part.kind !== 'static') continue;
                if (SRCSET_UNENCODED_COMMA_RE.test(part.value)) {
                    findings.push({
                        severity: 'error',
                        message:
                            'Wix media URL in srcset has unencoded commas in parameters (e.g. w_400,h_300). The srcset attribute uses commas to separate image candidates, so commas inside URLs must be encoded as %2C (e.g. w_400%2Ch_300). See agent-kit/wix-media.md.',
                        element: `<${tagName}>`,
                        attribute: attr,
                    });
                    break;
                }
            }
        }
    });

    return findings;
};
