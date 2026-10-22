/**
 * Deterministic, ordering-independent form slugs (DL#38 OQ-5 / Note B).
 *
 * A form's slug is the kebab-cased form name. When two or more forms share the
 * same kebab name, EVERY colliding form is suffixed with a stable prefix of its
 * OWN id — none is left bare on arrival order. A given form's slug therefore
 * depends only on its own name + id, never on List-response order or on which
 * other forms happen to exist that build.
 */

import { toKebabCase } from './contract-utils.js';

export interface FormIdentity {
    id: string;
    name?: string;
}

const MIN_SUFFIX_LENGTH = 4;

/** Returns a map of form id → unique slug. */
export function computeFormSlugs(forms: FormIdentity[]): Map<string, string> {
    const baseSlugById = new Map<string, string>();
    const idsByBaseSlug = new Map<string, string[]>();

    for (const form of forms) {
        const base = baseSlug(form);
        baseSlugById.set(form.id, base);
        const ids = idsByBaseSlug.get(base) ?? [];
        ids.push(form.id);
        idsByBaseSlug.set(base, ids);
    }

    const slugById = new Map<string, string>();
    for (const [base, ids] of idsByBaseSlug) {
        if (ids.length === 1) {
            slugById.set(ids[0], base);
            continue;
        }
        const suffixLength = resolveSuffixLength(ids);
        for (const id of ids) {
            slugById.set(id, `${base}-${idSuffix(id, suffixLength)}`);
        }
    }
    return slugById;
}

function baseSlug(form: FormIdentity): string {
    return toKebabCase(form.name ?? '') || toKebabCase(form.id) || 'form';
}

/** Smallest suffix length (≥ MIN_SUFFIX_LENGTH) that keeps all ids in the group distinct. */
function resolveSuffixLength(ids: string[]): number {
    const normalized = ids.map(normalizeId);
    const maxLength = Math.max(...normalized.map((id) => id.length), MIN_SUFFIX_LENGTH);
    for (let length = MIN_SUFFIX_LENGTH; length <= maxLength; length++) {
        const suffixes = new Set(normalized.map((id) => id.slice(0, length)));
        if (suffixes.size === ids.length) {
            return length;
        }
    }
    return maxLength;
}

function idSuffix(id: string, length: number): string {
    return normalizeId(id).slice(0, length);
}

function normalizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
