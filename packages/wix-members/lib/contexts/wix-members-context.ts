import { createJayContext, useGlobalContext, EventEmitter } from '@jay-framework/runtime';
import {
    createSignal,
    createEvent,
    registerReactiveGlobalContext,
    useReactive,
} from '@jay-framework/component';
import { Getter } from '@jay-framework/reactive';
import { Tokens } from '@wix/sdk';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
import { mapLoginState, mapErrorMessage } from './member-helpers.js';
import { setAuthCookie } from '../utils/auth-cookie.js';

// ============================================================================
// OAuthStrategy Auth Type
// ============================================================================

// WixClient.auth is typed generically — these methods exist at runtime when
// the client is created with OAuthStrategy (verified in exploration/wix-members-auth).
interface OAuthAuth {
    login(params: {
        email: string;
        password: string;
        captchaTokens?: { invisibleRecaptchaToken?: string; recaptchaToken?: string };
    }): Promise<any>;
    register(params: {
        email: string;
        password: string;
        profile?: { firstName?: string; lastName?: string };
        captchaTokens?: { invisibleRecaptchaToken?: string; recaptchaToken?: string };
    }): Promise<any>;
    getMemberTokensForDirectLogin(sessionToken: string): Promise<Tokens>;
    processVerification(params: { verificationCode: string }): Promise<any>;
    logout(originalUrl: string): Promise<{ logoutUrl: string }>;
    generateVisitorTokens(): Promise<Tokens>;
    setTokens(tokens: Tokens): void;
    getTokens(): Tokens;
    loggedIn(): boolean;
    sendPasswordResetEmail(email: string, redirectUri: string): Promise<void>;
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface WixMembersInitData {
    passwordResetRedirectUri?: string;
}

export interface LoginResult {
    success: boolean;
    state: string;
    errorCode?: string;
    errorMessage?: string;
    requiresEmailVerification?: boolean;
    stateToken?: string;
}

export interface RegisterResult {
    success: boolean;
    state: string;
    errorCode?: string;
    errorMessage?: string;
    requiresEmailVerification?: boolean;
    requiresOwnerApproval?: boolean;
    stateToken?: string;
}

export interface ReactiveMemberIndicator {
    isLoggedIn: Getter<boolean>;
    isLoading: Getter<boolean>;
    memberName: Getter<string>;
    memberAvatar: Getter<string>;
}

export interface WixMembersContext {
    memberIndicator: ReactiveMemberIndicator;

    login(email: string, password: string, captchaToken?: string): Promise<LoginResult>;
    register(
        email: string,
        password: string,
        profile?: { firstName?: string; lastName?: string },
        captchaToken?: string,
    ): Promise<RegisterResult>;
    verifyEmail(verificationCode: string): Promise<LoginResult>;
    logout(): Promise<void>;
    sendPasswordResetEmail(email: string): Promise<void>;
    refreshMemberState(): void;

    onLogin: EventEmitter<void, any>;
    onLogout: EventEmitter<void, any>;
}

export const WIX_MEMBERS_CONTEXT = createJayContext<WixMembersContext>('wix:members');

// ============================================================================
// Context Factory
// ============================================================================

export function provideWixMembersContext(initData: WixMembersInitData): WixMembersContext {
    const wixClientContext = useGlobalContext(WIX_CLIENT_CONTEXT);
    const wixClient = wixClientContext.client!;
    const auth = wixClient.auth as unknown as OAuthAuth;

    const membersContext = registerReactiveGlobalContext(WIX_MEMBERS_CONTEXT, () => {
        const [isLoggedIn, setIsLoggedIn] = createSignal(false);
        const [isLoading, setIsLoading] = createSignal(true);
        const [memberName, setMemberName] = createSignal('');
        const [memberAvatar, setMemberAvatar] = createSignal('');
        const reactive = useReactive();
        const onLogin = createEvent<void>();
        const onLogout = createEvent<void>();

        function updateMemberSignals(loggedIn: boolean, name = '', avatar = '') {
            reactive.batchReactions(() => {
                setIsLoggedIn(loggedIn);
                setIsLoading(false);
                setMemberName(name);
                setMemberAvatar(avatar);
            });
        }

        async function exchangeSessionToken(sessionToken: string): Promise<void> {
            const memberTokens = await auth.getMemberTokensForDirectLogin(sessionToken);
            auth.setTokens(memberTokens);
            setAuthCookie('member');
            updateMemberSignals(true);
        }

        async function login(
            email: string,
            password: string,
            captchaToken?: string,
        ): Promise<LoginResult> {
            const captchaTokens = captchaToken
                ? { invisibleRecaptchaToken: captchaToken }
                : undefined;
            const result = await auth.login({ email, password, captchaTokens });

            const mapped = mapLoginState(result);

            if (result.loginState === 'SUCCESS') {
                await exchangeSessionToken(result.data.sessionToken);
                onLogin.emit();
            }

            return mapped;
        }

        async function register(
            email: string,
            password: string,
            profile?: { firstName?: string; lastName?: string },
            captchaToken?: string,
        ): Promise<RegisterResult> {
            const captchaTokens = captchaToken
                ? { invisibleRecaptchaToken: captchaToken }
                : undefined;
            const result = await auth.register({
                email,
                password,
                profile,
                captchaTokens,
            });

            const mapped: RegisterResult = {
                success: result.loginState === 'SUCCESS',
                state: result.loginState,
                requiresEmailVerification: result.loginState === 'EMAIL_VERIFICATION_REQUIRED',
                requiresOwnerApproval: result.loginState === 'OWNER_APPROVAL_REQUIRED',
                stateToken: (result as any).data?.stateToken,
            };

            if (result.loginState === 'FAILURE') {
                mapped.errorCode = (result as any).errorCode;
                mapped.errorMessage = mapErrorMessage((result as any).errorCode);
            }

            if (result.loginState === 'SUCCESS') {
                await exchangeSessionToken(result.data.sessionToken);
                onLogin.emit();
            }

            return mapped;
        }

        async function verifyEmail(verificationCode: string): Promise<LoginResult> {
            const result = await auth.processVerification({ verificationCode });
            const mapped = mapLoginState(result);

            if (result.loginState === 'SUCCESS') {
                await exchangeSessionToken(result.data.sessionToken);
                onLogin.emit();
            }

            return mapped;
        }

        async function logout(): Promise<void> {
            try {
                await auth.logout(window.location.href);
            } catch {
                // logout() may fail for visitor tokens — expected
            }

            const visitorTokens = await auth.generateVisitorTokens();
            auth.setTokens(visitorTokens);
            setAuthCookie('visitor');
            updateMemberSignals(false);
            onLogout.emit();
        }

        async function sendPasswordResetEmail(email: string): Promise<void> {
            const redirectUri = initData.passwordResetRedirectUri || window.location.href;
            await auth.sendPasswordResetEmail(email, redirectUri);
        }

        function refreshMemberState(): void {
            const loggedIn = auth.loggedIn();
            setAuthCookie(loggedIn ? 'member' : 'visitor');
            updateMemberSignals(loggedIn);
        }

        return {
            memberIndicator: {
                isLoggedIn,
                isLoading,
                memberName,
                memberAvatar,
            },
            login,
            register,
            verifyEmail,
            logout,
            sendPasswordResetEmail,
            refreshMemberState,
            onLogin,
            onLogout,
        };
    });

    return membersContext;
}
