import type { WixClient } from '@wix/sdk';
import { wixFetch } from '@jay-framework/wix-server-client/client';

export interface MemberProfileView {
    name: string;
    avatar: string;
}

interface WixMemberProfile {
    firstName?: string;
    lastName?: string;
    nickname?: string;
    photo?: { url?: string };
}

interface WixMember {
    loginEmail?: string;
    profile?: WixMemberProfile;
}

interface GetMyMemberResponse {
    member?: WixMember;
}

export function formatMemberDisplayName(member: WixMember | null | undefined): string {
    if (!member) {
        return '';
    }

    const profile = member.profile;
    const fullName = [profile?.firstName?.trim(), profile?.lastName?.trim()]
        .filter(Boolean)
        .join(' ');
    if (fullName) {
        return fullName;
    }
    if (profile?.nickname?.trim()) {
        return profile.nickname.trim();
    }
    if (member.loginEmail) {
        return member.loginEmail;
    }
    return 'Member';
}

export async function loadMemberProfile(
    wixClient: WixClient,
    isLoggedIn: boolean,
): Promise<MemberProfileView> {
    if (!isLoggedIn) {
        return { name: '', avatar: '' };
    }

    try {
        const { member } = await wixFetch<GetMyMemberResponse>(
            wixClient,
            '/members/v1/members/my?fieldsets=FULL',
        );
        return {
            name: formatMemberDisplayName(member),
            avatar: member?.profile?.photo?.url ?? '',
        };
    } catch {
        return { name: 'Member', avatar: '' };
    }
}
