import { createJayContext, useGlobalContext, EventEmitter } from '@jay-framework/runtime';
import {
    createSignal,
    createEvent,
    registerReactiveGlobalContext,
    useReactive,
} from '@jay-framework/component';
import { Getter } from '@jay-framework/reactive';
import { Tokens } from '@wix/sdk';
import { WIX_CLIENT_CONTEXT, WixClientContext } from '@jay-framework/wix-server-client';
import { setAuthCookie } from '../utils/auth-cookie.js';
import { loadMemberProfile } from '../utils/member-profile.js';
import { memberAccessToken } from '../utils/member-access-token.js';
import { hostedLoginOptions, type SocialLoginProvider } from '../utils/hosted-login.js';
import {
    createDirectLogin,
    type DirectLoginAuth,
    type DirectLoginOptions,
    type MemberAuthResult,
    type RegisterOptions,
} from '../utils/direct-login.js';

// ============================================================================
// OAuthStrategy Auth Type
// ============================================================================

// WixClient.auth is typed generically — these methods exist at runtime when
// the client is created with OAuthStrategy (verified in exploration/wix-members-auth).
interface OAuthAuth {
    generateOAuthData(redirectUri: string, originalUri?: string): OauthData;
    getAuthUrl(
        oauthData: OauthData,
        opts?: {
            prompt?: 'login' | 'none';
            responseMode?: 'fragment' | 'web_message' | 'query';
            idp?: SocialLoginProvider;
        },
    ): Promise<{ authUrl: string }>;
    getMemberTokens(code: string, state: string, oauthData: OauthData): Promise<Tokens>;
    parseFromUrl(
        url?: string,
        responseMode?: 'query' | 'fragment',
    ): { code: string; state: string; error?: string; errorDescription?: string };
    logout(originalUrl: string): Promise<{ logoutUrl: string }>;
    generateVisitorTokens(): Promise<Tokens>;
    setTokens(tokens: Tokens): void;
    getTokens(): Tokens;
    loggedIn(): boolean;
    getAuthHeaders(): Promise<{ headers: { Authorization: string } }>;
}

interface OauthData {
    codeVerifier: string;
    codeChallenge: string;
    state: string;
    originalUri: string;
    redirectUri: string;
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface WixMembersInitData {
    authCallbackUrl?: string;
}

export interface ReactiveMemberIndicator {
    isLoggedIn: Getter<boolean>;
    isLoading: Getter<boolean>;
    memberName: Getter<string>;
    memberAvatar: Getter<string>;
}

export interface AuthCallbackResult {
    success: boolean;
    redirectTo: string;
    error?: string;
}

export interface WixMembersContext {
    memberIndicator: ReactiveMemberIndicator;

    /** The Wix-hosted login's URL; with `idp`, straight to that provider's sign-in (Google, Facebook). */
    redirectToLogin(callbackUrl?: string, options?: { idp?: SocialLoginProvider }): Promise<string>;
    handleAuthCallback(url?: string): Promise<AuthCallbackResult>;
    logout(): Promise<void>;
    refreshMemberState(): Promise<void>;
    /**
     * The logged-in member's access token, renewed when it expired, or undefined for a visitor. For a backend the
     * site calls on the member's behalf (e.g. to serve members-only pages), which checks it with Wix.
     */
    memberAccessToken(): Promise<string | undefined>;

    /** Log in with email and password on this page (no redirect), as the Wix site members dialog does. */
    login(email: string, password: string, options?: DirectLoginOptions): Promise<MemberAuthResult>;
    /** Sign up with email and password on this page; logs the new member in unless the site asks for more. */
    register(email: string, password: string, options?: RegisterOptions): Promise<MemberAuthResult>;
    /** Complete a login or sign-up that returned `emailVerificationRequired` with the code Wix emailed. */
    verifyEmail(code: string): Promise<MemberAuthResult>;
    /** Email a password reset link; the link returns to `redirectUri` (default: the current page). */
    sendPasswordReset(email: string, redirectUri?: string): Promise<void>;

    onLogin: EventEmitter<void, any>;
    onLogout: EventEmitter<void, any>;
}

export const WIX_MEMBERS_CONTEXT = createJayContext<WixMembersContext>('wix:members');

const OAUTH_DATA_KEY = 'wix_members_oauth_data';

// ============================================================================
// Context Factory
// ============================================================================

export function provideWixMembersContext(initData: WixMembersInitData): WixMembersContext {
    const wixClientContext: WixClientContext = useGlobalContext(WIX_CLIENT_CONTEXT);
    const wixClient = wixClientContext.client!;
    const auth = wixClient.auth as unknown as OAuthAuth & DirectLoginAuth;
    // Tokens set through the client context are kept for later page loads (older contexts lack setTokens).
    const keepTokens = (tokens: Tokens) =>
        wixClientContext.setTokens ? wixClientContext.setTokens(tokens) : auth.setTokens(tokens);

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

        function getCallbackUrl(): string {
            const url = initData.authCallbackUrl || '/auth/callback';
            if (url.startsWith('http')) return url;
            return window.location.origin + url;
        }

        async function redirectToLogin(
            callbackUrl?: string,
            options?: { idp?: SocialLoginProvider },
        ): Promise<string> {
            const redirectUri = callbackUrl || getCallbackUrl();
            const oauthData = auth.generateOAuthData(redirectUri, window.location.href);

            sessionStorage.setItem(OAUTH_DATA_KEY, JSON.stringify(oauthData));

            const { authUrl } = await auth.getAuthUrl(oauthData, hostedLoginOptions(options?.idp));

            return authUrl;
        }

        async function handleAuthCallback(url?: string): Promise<AuthCallbackResult> {
            const storedData = sessionStorage.getItem(OAUTH_DATA_KEY);
            if (!storedData) {
                return { success: false, redirectTo: '/', error: 'No OAuth data found' };
            }

            const oauthData: OauthData = JSON.parse(storedData);
            sessionStorage.removeItem(OAUTH_DATA_KEY);

            const { code, state, error, errorDescription } = auth.parseFromUrl(
                url || window.location.href,
                'query',
            );

            if (error) {
                return {
                    success: false,
                    redirectTo: oauthData.originalUri || '/',
                    error: errorDescription || error,
                };
            }

            const memberTokens = await auth.getMemberTokens(code, state, oauthData);
            keepTokens(memberTokens);
            setAuthCookie('member');
            await refreshMemberState();
            onLogin.emit();

            return {
                success: true,
                redirectTo: oauthData.originalUri || '/',
            };
        }

        async function logout(): Promise<void> {
            try {
                await auth.logout(window.location.href);
            } catch {
                // logout() may fail for visitor tokens — expected
            }

            const visitorTokens = await auth.generateVisitorTokens();
            keepTokens(visitorTokens);
            setAuthCookie('visitor');
            await refreshMemberState();
            onLogout.emit();
        }

        async function refreshMemberState(): Promise<void> {
            const loggedIn = auth.loggedIn();
            if (!loggedIn) {
                setAuthCookie('visitor');
                updateMemberSignals(false);
                return;
            }

            setAuthCookie('member');
            setIsLoading(true);
            const profile = await loadMemberProfile(wixClient, loggedIn);
            updateMemberSignals(true, profile.name, profile.avatar);
        }

        const directLogin = createDirectLogin(
            auth,
            async (tokens) => {
                keepTokens(tokens);
                setAuthCookie('member');
                await refreshMemberState();
                onLogin.emit();
            },
            {
                redirectUri:
                    typeof window === 'undefined' ? undefined : `${window.location.origin}/`,
            },
        );

        return {
            login: directLogin.login,
            register: directLogin.register,
            verifyEmail: directLogin.verifyEmail,
            sendPasswordReset: (email: string, redirectUri?: string) =>
                directLogin.sendPasswordReset(email, redirectUri ?? window.location.href),
            memberIndicator: {
                isLoggedIn,
                isLoading,
                memberName,
                memberAvatar,
            },
            redirectToLogin,
            handleAuthCallback,
            logout,
            refreshMemberState,
            memberAccessToken: () => memberAccessToken(auth, keepTokens),
            onLogin,
            onLogout,
        };
    });

    return membersContext;
}
