/**
 * Member-prefill mapping (DL#39 Capability 2, Q3).
 *
 * The plugin cannot infer which field is "the email" or "the name" — field targets
 * are site-defined — so member prefill is opt-in config: a map from a field target
 * to a dot-path into the Wix member (`{ email: 'loginEmail', firstName: 'profile.firstName' }`).
 * This module resolves that map against a fetched member, purely and testably.
 */

import type { WixMember } from '../wix-apis/get-my-member.js';

/** Map of `<fieldTarget>` → `<member dot-path>` (e.g. `profile.firstName`). */
export type MemberPrefillMap = Record<string, string>;

function resolvePath(source: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((value, key) => {
        if (value && typeof value === 'object') {
            return (value as Record<string, unknown>)[key];
        }
        return undefined;
    }, source);
}

/**
 * Resolve the prefill map against a member into `{ <fieldTarget>: value }`, keeping
 * only non-empty string values. Returns `{}` for a visitor (no member).
 */
export function readMemberPrefillValues(
    member: WixMember | undefined,
    memberPrefill: MemberPrefillMap,
): Record<string, string> {
    if (!member) {
        return {};
    }
    const values: Record<string, string> = {};
    for (const [target, memberPath] of Object.entries(memberPrefill)) {
        const resolved = resolvePath(member, memberPath);
        if (typeof resolved === 'string' && resolved.trim()) {
            values[target] = resolved;
        }
    }
    return values;
}
