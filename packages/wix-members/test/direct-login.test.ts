import { describe, expect, it, vi } from 'vitest';
import { createDirectLogin, memberTokensByRedirect, type DirectLoginAuth, type OAuthData, type SdkLoginState } from '../lib/utils/direct-login';

const MEMBER_TOKENS = { accessToken: { value: 'a', expiresAt: 1 }, refreshToken: { value: 'r', role: 'member' } };

function fakeAuth(results: Partial<Record<'login' | 'register' | 'processVerification', SdkLoginState>>) {
    return {
        login: vi.fn(async () => results.login!),
        register: vi.fn(async () => results.register!),
        processVerification: vi.fn(async () => results.processVerification!),
        getMemberTokensForDirectLogin: vi.fn(async () => MEMBER_TOKENS as never),
        sendPasswordResetEmail: vi.fn(async () => {}),
    } satisfies DirectLoginAuth;
}

describe('direct login', () => {
    it('exchanges the session token of a successful login for member tokens and hands them over', async () => {
        const auth = fakeAuth({ login: { loginState: 'SUCCESS', data: { sessionToken: 'st' } } });
        const kept = vi.fn(async () => {});
        const result = await createDirectLogin(auth, kept).login('ada@example.com', 'pw', { captchaToken: 'cap' });
        expect(result).toEqual({ status: 'success' });
        expect(auth.login).toHaveBeenCalledWith({
            email: 'ada@example.com',
            password: 'pw',
            captchaTokens: { recaptchaToken: 'cap' },
        });
        expect(auth.getMemberTokensForDirectLogin).toHaveBeenCalledWith('st');
        expect(kept).toHaveBeenCalledWith(MEMBER_TOKENS);
    });

    it('reports a wrong password with its code and keeps no tokens', async () => {
        const auth = fakeAuth({ login: { loginState: 'FAILURE', errorCode: 'invalidPassword', error: 'Wrong password' } });
        const kept = vi.fn(async () => {});
        expect(await createDirectLogin(auth, kept).login('a@b.c', 'x')).toEqual({
            status: 'failure',
            errorCode: 'invalidPassword',
            error: 'Wrong password',
        });
        expect(kept).not.toHaveBeenCalled();
    });

    it('asks for a captcha when the site requires one', async () => {
        const auth = fakeAuth({ register: { loginState: 'FAILURE', errorCode: 'missingCaptchaToken', error: 'captcha' } });
        expect(await createDirectLogin(auth, async () => {}).register('a@b.c', 'pw')).toEqual({ status: 'captchaRequired' });
    });

    it('signs up with the public-profile choice and reports a pending owner approval', async () => {
        const auth = fakeAuth({ register: { loginState: 'OWNER_APPROVAL_REQUIRED' } });
        const result = await createDirectLogin(auth, async () => {}).register('a@b.c', 'pw', { publicProfile: true });
        expect(result).toEqual({ status: 'ownerApprovalRequired' });
        expect(auth.register).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw', profile: { privacyStatus: 'PUBLIC' } });
    });

    it('completes an email-verified sign-up with the emailed code', async () => {
        const waiting: SdkLoginState = { loginState: 'EMAIL_VERIFICATION_REQUIRED', data: { stateToken: 'state' } };
        const auth = fakeAuth({ register: waiting, processVerification: { loginState: 'SUCCESS', data: { sessionToken: 'st2' } } });
        const kept = vi.fn(async () => {});
        const login = createDirectLogin(auth, kept);
        expect(await login.verifyEmail('123')).toMatchObject({ status: 'failure' });
        expect(await login.register('a@b.c', 'pw')).toEqual({ status: 'emailVerificationRequired' });
        expect(await login.verifyEmail('123456')).toEqual({ status: 'success' });
        expect(auth.processVerification).toHaveBeenCalledWith({ verificationCode: '123456' }, waiting);
        expect(kept).toHaveBeenCalledWith(MEMBER_TOKENS);
    });
});

describe('member tokens by redirect', () => {
    const OAUTH: OAuthData = { redirectUri: 'https://site.example/', originalUri: '', codeChallenge: 'cc', codeVerifier: 'cv', state: 'st8' };
    function codeAuth() {
        return {
            ...fakeAuth({ login: { loginState: 'SUCCESS', data: { sessionToken: 'st' } } }),
            generateOAuthData: vi.fn(() => OAUTH),
            getAuthUrl: vi.fn(async () => ({ authUrl: 'https://wix.example/authorize?x=1' })),
            parseFromUrl: vi.fn((url: string) => {
                const q = new URL(url).searchParams;
                return { code: q.get('code'), state: q.get('state'), ...(q.get('error') ? { error: q.get('error')! } : {}) };
            }),
            getMemberTokens: vi.fn(async () => MEMBER_TOKENS as never),
        };
    }

    it("exchanges the code Wix returns to the site's own redirect URI, without the postMessage frame", async () => {
        const auth = codeAuth();
        const frame = vi.fn(async () => 'https://site.example/?code=c0de&state=st8');
        const kept = vi.fn(async () => {});
        const login = createDirectLogin(auth, kept, { redirectUri: 'https://site.example/', frame });
        expect(await login.login('a@b.c', 'pw')).toEqual({ status: 'success' });
        expect(auth.generateOAuthData).toHaveBeenCalledWith('https://site.example/');
        expect(auth.getAuthUrl).toHaveBeenCalledWith(OAUTH, { prompt: 'none', responseMode: 'query', sessionToken: 'st' });
        expect(frame).toHaveBeenCalledWith('https://wix.example/authorize?x=1', 'https://site.example/', 30_000);
        expect(auth.getMemberTokens).toHaveBeenCalledWith('c0de', 'st8', OAUTH);
        expect(auth.getMemberTokensForDirectLogin).not.toHaveBeenCalled();
        expect(kept).toHaveBeenCalledWith(MEMBER_TOKENS);
    });

    it('fails the login when Wix returns an error instead of a code', async () => {
        const auth = codeAuth();
        await expect(memberTokensByRedirect(auth, 'st', 'https://site.example/', async () => 'https://site.example/?error=login_required')).rejects.toThrow('login_required');
        expect(auth.getMemberTokens).not.toHaveBeenCalled();
    });

    it("keeps the SDK's frame without a redirect URI", async () => {
        const auth = codeAuth();
        await createDirectLogin(auth, async () => {}).login('a@b.c', 'pw');
        expect(auth.getMemberTokensForDirectLogin).toHaveBeenCalledWith('st');
        expect(auth.getAuthUrl).not.toHaveBeenCalled();
    });
});
