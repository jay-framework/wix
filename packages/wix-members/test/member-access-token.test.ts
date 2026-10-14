import { describe, expect, it, vi } from 'vitest';
import { memberAccessToken } from '../lib/utils/member-access-token';

const tokens = (access: string) => ({ accessToken: { value: access, expiresAt: 1 }, refreshToken: { value: 'r', role: 'member' } }) as never;

describe('member access token', () => {
    it('is undefined for a visitor', async () => {
        const auth = { loggedIn: () => false, getTokens: vi.fn(), getAuthHeaders: vi.fn() };
        expect(await memberAccessToken(auth, vi.fn())).toBeUndefined();
        expect(auth.getAuthHeaders).not.toHaveBeenCalled();
    });

    it("is the member's current token, kept again only when the SDK renewed it", async () => {
        let current = 'old';
        const auth = { loggedIn: () => true, getTokens: () => tokens(current), getAuthHeaders: async () => ({ headers: { Authorization: current } }) };
        const keep = vi.fn();
        expect(await memberAccessToken(auth, keep)).toBe('old');
        expect(keep).not.toHaveBeenCalled();
        auth.getAuthHeaders = async () => { current = 'renewed'; return { headers: { Authorization: current } }; };
        expect(await memberAccessToken(auth, keep)).toBe('renewed');
        expect(keep).toHaveBeenCalledWith(tokens('renewed'));
    });
});
