import type {
    JayHtmlValidatorFn,
    JayHtmlValidationFinding,
    DataScope,
} from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';
// @ts-ignore — no type declarations
import { parseTemplateParts } from '@jay-framework/compiler-jay-html';
const STATIC_ELEMENTS = new Set(['img', 'video', 'source', 'link']);
const SRC_ATTRS = ['src', 'poster'];
const HREF_ATTRS = ['href'];
const ASSET_EXTENSIONS_RE = /\.(jpe?g|png|gif|webp|svg|bmp|ico|woff2?|ttf|css|js)$/i;

function isLocalPath(value: string): boolean {
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:'))
        return false;
    return true;
}

function suggestRenamed(filePath: string): string {
    return filePath.replace(/ /g, '-');
}

export const validate: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];

    walkElements(ctx.body, ctx, (el: any, _scope: DataScope) => {
        const tagName = el.rawTagName?.toLowerCase();
        if (!tagName || !STATIC_ELEMENTS.has(tagName)) return;

        const attrsToCheck = tagName === 'link' ? HREF_ATTRS : SRC_ATTRS;

        for (const attr of attrsToCheck) {
            const value = el.getAttribute(attr);
            if (!value) continue;

            const parts: Array<{ kind: string; value: string }> = parseTemplateParts(value);
            if (!parts.every((p) => p.kind === 'static')) continue;

            const staticValue = parts.map((p) => p.value).join('');
            if (!isLocalPath(staticValue)) continue;
            if (!ASSET_EXTENSIONS_RE.test(staticValue)) continue;
            if (!staticValue.includes(' ')) continue;

            findings.push({
                severity: 'error',
                message: `Static file path '${staticValue}' contains spaces — Wix CDN replaces spaces with hyphens, breaking the reference. Rename the file to '${suggestRenamed(staticValue)}' and update all references.`,
                element: `<${tagName}>`,
                attribute: attr,
            });
        }
    });

    return findings;
};
