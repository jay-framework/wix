import type {
    JayHtmlValidatorFn,
    JayHtmlValidationFinding,
    JayHtmlValidationContext,
    DataScope,
} from '@jay-framework/compiler-shared';
import { walkElements, resolveBinding } from '@jay-framework/compiler-shared';
import { parseTemplateParts } from '@jay-framework/compiler-jay-html';
import type { HTMLElement } from 'node-html-parser';

const PLUGIN_KEY = 'wix-media';
const SUPPRESSION_KEY = 'allow-unsized-media';
export const NO_DIMENSIONS_CODE = 'WIX-MEDIA-NO-DIMENSIONS';
const GUIDE = 'agent-kit/designer/wix-media.md';
const SUPPRESSION_HINT =
    `If the size comes from a CSS class, add <script type="application/jay-validations">` +
    `${PLUGIN_KEY}: { ${SUPPRESSION_KEY}: true }</script> to the page.`;

const WIXSTATIC_MEDIA_RE = /static\.wixstatic\.com\/media\//;
const V1_TRANSFORM_RE = /\/v1\//;
const IMAGE_EXTENSIONS_RE = /\.(jpe?g|png|gif|webp|svg|bmp|ico)$/i;

const SRCSET_UNENCODED_COMMA_RE = /\/v1\/[^/]+\/[^/]*[a-z]_\d+,[a-z]_\d+/;
const WIDTH_PARAM_RE = /w_(\d+)/;
const SRCSET_MIN_WIDTH_THRESHOLD = 400;

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
                        message: `Wix media URL missing image optimization parameters. See ${GUIDE} for transformation reference.`,
                        element: `<${tagName}>`,
                        attribute: attr,
                    });
                } else if (isLocalImagePath(staticValue)) {
                    findings.push({
                        severity: 'error',
                        message: `Local image reference '${staticValue}' — run \`jay-stack-cli run wix-media/upload-public\` to upload local images to Wix Media Manager, then use the Wix media URL with optimization parameters. See ${GUIDE}.`,
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
                        message: `Image binding '{${part.value}}' produces a Wix media URL but no optimization parameters are applied. See ${GUIDE} for transformation reference.`,
                        element: `<${tagName}>`,
                        attribute: attr,
                    });
                }
            }
        }

        const unsized = findUnsizedWixImage(el, tagName, scope, ctx);
        if (unsized) findings.push(unsized);

        if (tagName === 'img' && !el.getAttribute('srcset')) {
            const srcValue = el.getAttribute('src');
            if (srcValue) {
                const srcParts = parseTemplateParts(srcValue);
                const staticText = srcParts
                    .filter((p) => p.kind === 'static')
                    .map((p) => p.value)
                    .join('');
                if (V1_TRANSFORM_RE.test(staticText)) {
                    const widthMatch = staticText.match(WIDTH_PARAM_RE);
                    if (widthMatch && parseInt(widthMatch[1], 10) >= SRCSET_MIN_WIDTH_THRESHOLD) {
                        findings.push({
                            severity: 'warning',
                            message: `This image is ≥400px wide but has no srcset attribute. Add srcset with sizes for common breakpoints to serve appropriately sized images across devices. See ${GUIDE} for the responsive image pattern.`,
                            element: '<img>',
                            attribute: 'src',
                        });
                    }
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
                        message: `Wix media URL in srcset has unencoded commas in parameters (e.g. w_400,h_300). The srcset attribute uses commas to separate image candidates, so commas inside URLs must be encoded as %2C (e.g. w_400%2Ch_300). See ${GUIDE}.`,
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

const RESERVED_SPACE_ATTR: Record<string, string> = { img: 'src', video: 'poster' };

function findUnsizedWixImage(
    element: HTMLElement,
    tagName: string,
    scope: DataScope,
    ctx: JayHtmlValidationContext,
): JayHtmlValidationFinding | undefined {
    const attribute = RESERVED_SPACE_ATTR[tagName];
    if (!attribute || isSuppressed(ctx) || hasReservedSpace(element)) return undefined;
    const binding = firstWixImageBinding(element.getAttribute(attribute), scope, ctx);
    if (!binding) return undefined;
    return {
        severity: 'warning',
        message: `${NO_DIMENSIONS_CODE}: <${tagName}> binds a Wix image ('{${binding}}') but has no width/height or aspect-ratio, so the page jumps when it loads. See ${GUIDE} → Reserve space (CLS).`,
        suggestion: `Copy the transform size: /v1/fill/w_400,h_300 → width="400" height="300" (for /v1/fit/, use intrinsic width/height or style="aspect-ratio:…"). ${SUPPRESSION_HINT}`,
        element: `<${tagName}>`,
        attribute,
    };
}

function firstWixImageBinding(
    value: string | undefined,
    scope: DataScope,
    ctx: JayHtmlValidationContext,
): string | undefined {
    if (!value) return undefined;
    return parseTemplateParts(value).find(
        (part) =>
            part.kind === 'binding' &&
            resolveBindingWithHeadless(part.value, scope, ctx).tag?.meta?.mediaType === 'wix-image',
    )?.value;
}

function hasReservedSpace(element: HTMLElement): boolean {
    if (element.hasAttribute('width') && element.hasAttribute('height')) return true;
    const style = element.getAttribute('style');
    if (!style) return false;
    const parts = parseTemplateParts(style);
    // A bound style may size the box at runtime; trust it rather than guess.
    if (parts.some((part) => part.kind === 'binding')) return true;
    return styleSizesBox(style);
}

function styleSizesBox(style: string): boolean {
    const declarations = new Map<string, string>();
    for (const declaration of style.split(';')) {
        const colon = declaration.indexOf(':');
        if (colon < 0) continue;
        const property = declaration.slice(0, colon).trim().toLowerCase();
        declarations.set(
            property,
            declaration
                .slice(colon + 1)
                .trim()
                .toLowerCase(),
        );
    }
    if (declarations.has('aspect-ratio')) return true;
    const isSet = (property: string) => {
        const value = declarations.get(property);
        return value !== undefined && value !== '' && value !== 'auto';
    };
    return isSet('width') && isSet('height');
}

function isSuppressed(ctx: JayHtmlValidationContext): boolean {
    return ctx.validationOverrides?.[PLUGIN_KEY]?.[SUPPRESSION_KEY] === true;
}
