// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readMemberPrefillValues } from '../lib/utils/member-prefill.js';
import type { WixMember } from '../lib/wix-apis/get-my-member.js';

const member: WixMember = {
    loginEmail: 'ada@example.com',
    profile: { firstName: 'Ada', lastName: 'Lovelace', nickname: '' },
};

describe('readMemberPrefillValues', () => {
    it('should resolve top-level and dot-path member fields by target', () => {
        expect(
            readMemberPrefillValues(member, {
                email: 'loginEmail',
                firstName: 'profile.firstName',
                lastName: 'profile.lastName',
            }),
        ).toEqual({
            email: 'ada@example.com',
            firstName: 'Ada',
            lastName: 'Lovelace',
        });
    });

    it('should skip targets whose member value is empty or missing', () => {
        expect(
            readMemberPrefillValues(member, {
                nickname: 'profile.nickname', // empty string → skipped
                phone: 'profile.phone', // missing path → skipped
            }),
        ).toEqual({});
    });

    it('should return no values for a visitor (no member)', () => {
        expect(readMemberPrefillValues(undefined, { email: 'loginEmail' })).toEqual({});
    });
});
