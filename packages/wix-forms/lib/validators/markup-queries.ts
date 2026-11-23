/**
 * Read-only queries over a parsed jay-html body, shared by the wix-forms validators.
 */

/** `<key>.<field>.errorRule === RULE` (or `==`), the whole condition; anything else is unrecognised. */
const ERROR_RULE_CONDITION = /^(\w+)\.(\w+)\.errorRule\s*===?\s*(\w+)$/;
export const ERROR_TEXT_BINDING = /\{\s*(\w+)\.(\w+)\.error\s*\}/g;

export function tagNameOf(el: any): string {
    return String(el?.rawTagName ?? el?.tagName ?? '').toLowerCase();
}

export function closestAncestor(el: any, tagName: string): any {
    for (let node = el?.parentNode; node; node = node.parentNode) {
        if (tagNameOf(node) === tagName) return node;
    }
    return undefined;
}

export function matchedErrorRuleCondition(
    el: any,
    formKeys: Set<string>,
): { fieldPath: string; rule: string } | undefined {
    const condition: string | undefined = el?.getAttribute?.('if');
    const match = condition?.trim().match(ERROR_RULE_CONDITION);
    if (!match || !formKeys.has(match[1])) return undefined;
    return { fieldPath: `${match[1]}.${match[2]}`, rule: match[3] };
}

/** `{<key>.<field>.error}` in the element's own text nodes only. */
export function ownErrorBindings(el: any, formKeys: Set<string>): string[] {
    const ownText = (el?.childNodes ?? [])
        .filter((child: any) => child.nodeType === 3)
        .map((child: any) => String(child.rawText ?? child.text ?? ''))
        .join(' ');
    return [...ownText.matchAll(ERROR_TEXT_BINDING)]
        .filter((match) => formKeys.has(match[1]))
        .map((match) => `${match[1]}.${match[2]}`);
}

export function selfOrAncestorBranchesOn(
    el: any,
    fieldPath: string,
    formKeys: Set<string>,
): boolean {
    for (let node = el; node; node = node.parentNode) {
        if (matchedErrorRuleCondition(node, formKeys)?.fieldPath === fieldPath) return true;
    }
    return false;
}
