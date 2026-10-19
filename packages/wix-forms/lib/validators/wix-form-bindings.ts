/**
 * wix-forms plugin validator (DL#36).
 *
 * Fires on jay-html pages that use per-form contracts. Two detectable cases,
 * both carrying the DL#36 migration message:
 *
 *  1. Retired generic `fields` binding — a `form/<slug>` import that still binds
 *     `<key>.fields` (the generic repeated array removed in DL#36). This is the
 *     GUARANTEED case: the `form/` import resolves, so it appears in
 *     `headlessImports`. Detected across every binding form (data/forEach/if/ref).
 *  2. Unknown field tag used as a `ref` — `ref="<key>.<missingField>…"` whose
 *     first segment is not a tag of the form's contract. Core contract-binding
 *     validation already rejects unknown DATA bindings (`{<key>.x}`, `forEach`,
 *     `if`, attributes) but SILENTLY grafts unknown `ref=` sub-tags
 *     (`graftTemplateOnlyRefs`), so this check closes the one gap core misses
 *     (DL#36 hard gate; see Implementation Results for the core-vs-plugin finding).
 *
 * Best-effort: a page still importing the deleted `contract="wix-form"` also
 * gets the migration message, IF the unresolved name surfaces in headlessImports.
 */

import type {
    JayHtmlValidatorFn,
    JayHtmlValidationFinding,
} from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';

const RETIRED_CONTRACT_NAME = 'wix-form';
const FORM_CONTRACT_PREFIX = 'form/';

const MIGRATION_HINT =
    'The generic `fields` tag was removed in DL#36. Bind explicit per-form field tags instead ' +
    '— e.g. `{contact.email.label}`, `ref="contact.email.input"`, ' +
    '`<option forEach="contact.country.options" trackBy="value">`. Discover a form\'s real field ' +
    'names in agent-kit/references/wix-forms/forms.yaml or the materialized form/<slug> contract.';

export const validateWixFormBindings: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];

    for (const imp of ctx.headlessImports) {
        if (imp.contractName === RETIRED_CONTRACT_NAME) {
            findings.push({
                severity: 'error',
                message: `Contract "wix-form" was removed in DL#36 — forms now use a per-form contract "form/<slug>".`,
                suggestion: MIGRATION_HINT,
            });
        }
    }

    const formImports = ctx.headlessImports.filter(
        (imp) => imp.key && imp.contractName?.startsWith(FORM_CONTRACT_PREFIX),
    );
    if (formImports.length === 0) {
        return findings;
    }

    detectRetiredFieldsBindings(ctx, formImports, findings);
    detectUnknownRefFieldTags(ctx, formImports, findings);
    return findings;
};

function detectRetiredFieldsBindings(
    ctx: Parameters<JayHtmlValidatorFn>[0],
    formImports: Array<{ key?: string }>,
    findings: JayHtmlValidationFinding[],
): void {
    const serialized = serializeBody(ctx.body);
    if (!serialized) return;
    for (const imp of formImports) {
        const key = imp.key!;
        const pattern = new RegExp(`\\b${escapeRegExp(key)}\\.fields\\b`);
        if (pattern.test(serialized)) {
            findings.push({
                severity: 'error',
                message: `Binding "${key}.fields" uses the generic form-fields array removed in DL#36.`,
                suggestion: MIGRATION_HINT,
                attribute: 'fields',
            });
        }
    }
}

function detectUnknownRefFieldTags(
    ctx: Parameters<JayHtmlValidatorFn>[0],
    formImports: Array<{ key?: string; contractName: string; contract?: { tags: Array<{ tag: string }> } }>,
    findings: JayHtmlValidationFinding[],
): void {
    const tagsByKey = new Map<string, { contractName: string; tags: Set<string> }>();
    for (const imp of formImports) {
        tagsByKey.set(imp.key!, {
            contractName: imp.contractName,
            tags: new Set((imp.contract?.tags ?? []).map((tag) => tag.tag)),
        });
    }

    walkElements(ctx.body, ctx, (el: any) => {
        const ref: string | undefined = el?.getAttribute?.('ref');
        if (!ref) return;
        const [key, firstSegment] = ref.split('.');
        const info = tagsByKey.get(key);
        if (!info) return; // not a per-form import key
        if (!firstSegment || firstSegment === 'fields') return; // retired-fields handled above
        if (info.tags.size === 0) return; // contract tags unavailable — nothing to check against
        if (!info.tags.has(firstSegment)) {
            findings.push({
                severity: 'error',
                message: `ref="${ref}" binds "${firstSegment}", which is not a field of contract "${info.contractName}".`,
                suggestion:
                    `Available tags: ${[...info.tags].sort().join(', ')}. ` +
                    'Check the field name against the materialized form/<slug> contract or ' +
                    'agent-kit/references/wix-forms/forms.yaml.',
                attribute: 'ref',
            });
        }
    });
}

function serializeBody(body: unknown): string {
    try {
        return String((body as { toString(): string })?.toString?.() ?? '');
    } catch {
        return '';
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
