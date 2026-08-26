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

// ============================================================================
// OAuthStrategy Auth Type
// ============================================================================

// WixClient.auth is typed generically — these methods exist at runtime when
// the client is created with OAuthStrategy (verified in exploration/wix-members-auth).
interface OAuthAuth {
    generateOAuthData(redirectUri: string, originalUri?: string): OauthData;
    getAuthUrl(
        oauthData: OauthData,
        opts?: { prompt?: 'login' | 'none'; responseMode?: 'fragment' | 'web_message' | 'query' },
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

    redirectToLogin(callbackUrl?: string): Promise<string>;
    handleAuthCallback(url?: string): Promise<AuthCallbackResult>;
    logout(): Promise<void>;
    refreshMemberState(): Promise<void>;

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

        function getCallbackUrl(): string {
            const url = initData.authCallbackUrl || '/auth/callback';
            if (url.startsWith('http')) return url;
            return window.location.origin + url;
        }

        async function redirectToLogin(callbackUrl?: string): Promise<string> {
            const redirectUri = callbackUrl || getCallbackUrl();
            const oauthData = auth.generateOAuthData(redirectUri, window.location.href);

            sessionStorage.setItem(OAUTH_DATA_KEY, JSON.stringify(oauthData));

            const { authUrl } = await auth.getAuthUrl(oauthData, {
                prompt: 'login',
                responseMode: 'query',
            });

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
            auth.setTokens(memberTokens);
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
            auth.setTokens(visitorTokens);
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

        return {
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
            onLogin,
            onLogout,
        };
    });

    return membersContext;
}
