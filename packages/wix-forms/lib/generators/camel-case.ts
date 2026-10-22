/**
 * camelCase that preserves leading underscores (DL#38).
 *
 * jay camelCases every contract tag into the compiled ViewState accessor and
 * ref name using `@jay-framework/compiler-shared`'s `camelCase`, which wraps
 * `change-case` but keeps leading underscores (the standard `change-case`
 * strips them). wix-forms must produce the SAME tag so the generated contract
 * tag, the compiled accessor, and the ref name all agree.
 *
 * This is a small local copy rather than an import of `compiler-shared`'s
 * `camelCase` on purpose: `contractTagName` runs in the interactive (client)
 * phase of the form component, and importing the compiler into the client
 * bundle would be wrong. It depends only on the tiny `change-case` package,
 * pinned to the same version jay uses.
 */
import { camelCase as baseCamelCase } from 'change-case';

export function camelCase(value: string): string {
    let leadingUnderscores = 0;
    for (const char of value) {
        if (char === '_') leadingUnderscores++;
        else break;
    }
    if (leadingUnderscores === 0) return baseCamelCase(value);
    const withoutLeadingUnderscores = value.slice(leadingUnderscores);
    return '_'.repeat(leadingUnderscores) + baseCamelCase(withoutLeadingUnderscores);
}
