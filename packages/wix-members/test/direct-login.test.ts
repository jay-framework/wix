import { describe, expect, it, vi } from 'vitest';
import { createDirectLogin, type DirectLoginAuth, type SdkLoginState } from '../lib/utils/direct-login';

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
