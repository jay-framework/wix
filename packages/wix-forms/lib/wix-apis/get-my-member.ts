/**
 * Fetch the signed-in member for prefill (DL#39 Capability 2).
 *
 * Reads the public Wix Members REST endpoint `GET /members/v1/members/my` — the
 * same endpoint and field shape wix-members reads — WITHOUT a package dependency
 * on the sibling plugin. This runs in the interactive (client) phase (DL#39 Q4),
 * so it imports `wixFetch` from the CLIENT entry `@jay-framework/wix-server-client/client`
 * (mirroring the client-side member-profile precedent), not the server entry.
 */

import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client/client';

export interface WixMemberProfile {
    firstName?: string;
    lastName?: string;
    nickname?: string;
}

export interface WixMember {
    loginEmail?: string;
    profile?: WixMemberProfile;
}

interface GetMyMemberResponse {
    member?: WixMember;
}

/**
 * Fetch the signed-in member. Returns `undefined` for a visitor or on any error —
 * prefill is best-effort and must never block or break an interactive form.
 */
export async function getMyMember(client: WixClient): Promise<WixMember | undefined> {
    try {
        const { member } = await wixFetch<GetMyMemberResponse>(
            client,
            '/members/v1/members/my?fieldsets=FULL',
        );
        return member;
    } catch {
        return undefined;
    }
}
