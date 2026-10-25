/**
 * wix-forms plugin validator (DL#38).
 *
 * Fires on jay-html pages that use per-form contracts. Two detectable cases,
 * both carrying the DL#38 migration message:
 *
 *  1. Retired generic `fields` binding — a `form/<slug>` import that still binds
 *     `<key>.fields` (the generic repeated array removed in DL#38). This is the
 *     GUARANTEED case: the `form/` import resolves, so it appears in
 *     `headlessImports`. Detected across every binding form (data/forEach/if/ref).
 *  2. Unknown field tag used as a `ref` — `ref="<key>.<missingField>…"` whose
 *     first segment is not a tag of the form's contract. Core contract-binding
 *     validation already rejects unknown DATA bindings (`{<key>.x}`, `forEach`,
 *     `if`, attributes) but SILENTLY grafts unknown `ref=` sub-tags
 *     (`graftTemplateOnlyRefs`), so this check closes the one gap core misses
 *     (DL#38 hard gate; see Implementation Results for the core-vs-plugin finding).
 *
 * Best-effort: a page still importing the deleted `contract="wix-form"` also
 * gets the migration message, IF the unresolved name surfaces in headlessImports.
 */

import type {
    JayHtmlValidatorFn,
    JayHtmlValidationFinding,
} from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';
import { loadWixFormsConfig } from '../config-loader.js';
import { contractTagName } from '../generators/contract-utils.js';

const RETIRED_CONTRACT_NAME = 'wix-form';
const FORM_CONTRACT_PREFIX = 'form/';

const MIGRATION_HINT =
    'The generic `fields` tag was removed in DL#38. Bind explicit per-form field tags instead ' +
    '— e.g. `{contact.email.label}`, `ref="contact.email.input"`, ' +
    '`<option forEach="contact.country.options" trackBy="value">`. Discover a form\'s real field ' +
    'names in agent-kit/references/wix-forms/forms.yaml or the materialized form/<slug> contract.';

export const validateWixFormBindings: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];

    for (const imp of ctx.headlessImports) {
        if (imp.contractName === RETIRED_CONTRACT_NAME) {
            findings.push({
                severity: 'error',
                message: `Contract "wix-form" was removed in DL#38 — forms now use a per-form contract "form/<slug>".`,
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
    detectUnknownMemberPrefillTargets(ctx, formImports, findings);
    return findings;
};

/**
 * memberPrefill config drift (DL#39 Capability 2 / §Agent Feedback Loop): a configured
 * `memberPrefill` target that matches NO field of any form imported on this page is almost
 * certainly a typo. Targets are raw field targets, so compare them camelCased, the way the
 * generated contract tags are named (DL#38 Break B).
 */
function detectUnknownMemberPrefillTargets(
    ctx: Parameters<JayHtmlValidatorFn>[0],
    formImports: Array<{ key?: string; contractName: string; contract?: { tags?: Array<{ tag: string }> } }>,
    findings: JayHtmlValidationFinding[],
): void {
    const memberPrefill = loadMemberPrefillSafely(ctx.projectRoot);
    const targets = Object.keys(memberPrefill);
    if (!targets.length) return;

    const knownTags = new Set<string>();
    for (const imp of formImports) {
        for (const tag of imp.contract?.tags ?? []) {
            knownTags.add(tag.tag);
        }
    }
    if (!knownTags.size) return; // no resolvable contract tags — nothing to check against

    for (const target of targets) {
        if (!knownTags.has(contractTagName(target))) {
            findings.push({
                severity: 'error',
                message: `memberPrefill target "${target}" is not a field of any form on this page.`,
                suggestion:
                    'Check the field target in config/.wix-forms.yaml against the form\'s fields ' +
                    '(agent-kit/references/wix-forms/forms.yaml or the materialized form/<slug> contract).',
            });
        }
    }
}

function loadMemberPrefillSafely(projectRoot: string): Record<string, string> {
    try {
        return loadWixFormsConfig(projectRoot).memberPrefill;
    } catch {
        return {};
    }
}

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
                message: `Binding "${key}.fields" uses the generic form-fields array removed in DL#38.`,
                suggestion: MIGRATION_HINT,
                attribute: 'fields',
            });
        }
    }
}

interface ContractTag {
    tag: string;
    tags?: ContractTag[];
}

interface FormImportInfo {
    contractName: string;
    tags: Set<string>;
    /** Per-field sub-contract tag names, when the validation context carries nested tags (gate iv). */
    subTagsByField: Map<string, Set<string>>;
}

function detectUnknownRefFieldTags(
    ctx: Parameters<JayHtmlValidatorFn>[0],
    formImports: Array<{ key?: string; contractName: string; contract?: { tags?: ContractTag[] } }>,
    findings: JayHtmlValidationFinding[],
): void {
    const infoByKey = new Map<string, FormImportInfo>();
    for (const imp of formImports) {
        const topTags = imp.contract?.tags ?? [];
        const subTagsByField = new Map<string, Set<string>>();
        for (const tag of topTags) {
            if (Array.isArray(tag.tags) && tag.tags.length) {
                subTagsByField.set(tag.tag, new Set(tag.tags.map((sub) => sub.tag)));
            }
        }
        infoByKey.set(imp.key!, {
            contractName: imp.contractName,
            tags: new Set(topTags.map((tag) => tag.tag)),
            subTagsByField,
        });
    }

    walkElements(ctx.body, ctx, (el: any) => {
        const ref: string | undefined = el?.getAttribute?.('ref');
        if (!ref) return;
        const [key, firstSegment, secondSegment] = ref.split('.');
        const info = infoByKey.get(key);
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
            return;
        }
        // Second-segment sub-tag check (DL#39 §Agent Feedback Loop — gate iv). Only runs when the
        // validation context carries the field's nested sub-contract tags; otherwise the guaranteed
        // first-segment check above plus the agent-kit guide cover it (the stated fallback).
        if (!secondSegment) return;
        const subTags = info.subTagsByField.get(firstSegment);
        if (!subTags || subTags.size === 0) return; // nested tags unavailable — fallback holds
        if (!subTags.has(secondSegment)) {
            findings.push({
                severity: 'error',
                message: `ref="${ref}" binds "${firstSegment}.${secondSegment}", which is not a channel of field "${firstSegment}".`,
                suggestion:
                    `Available channels: ${[...subTags].sort().join(', ')}. ` +
                    'A custom-UI field binds `.control`; a native field binds `.input`.',
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
