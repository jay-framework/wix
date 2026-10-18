import type { Tokens } from '@wix/sdk';

/**
 * Login and sign-up on the site's own pages (email and password), as the site members dialog of a Wix site does,
 * instead of redirecting to the Wix-hosted login page. Uses the OAuthStrategy's direct-login methods.
 */

/** The OAuthStrategy auth methods direct login uses (`WixClient.auth` is typed generically). */
export interface DirectLoginAuth {
    login(params: {
        email: string;
        password: string;
        captchaTokens?: { recaptchaToken?: string; invisibleRecaptchaToken?: string };
    }): Promise<SdkLoginState>;
    register(params: {
        email: string;
        password: string;
        profile?: { nickname?: string; privacyStatus?: 'PUBLIC' | 'PRIVATE' };
        captchaTokens?: { recaptchaToken?: string; invisibleRecaptchaToken?: string };
    }): Promise<SdkLoginState>;
    processVerification(
        nextInputs: { verificationCode: string },
        state?: SdkLoginState,
    ): Promise<SdkLoginState>;
    getMemberTokensForDirectLogin(sessionToken: string): Promise<Tokens>;
    sendPasswordResetEmail(email: string, redirectUri: string): Promise<void>;
    /** The authorization-code methods `memberTokensByRedirect` uses. */
    generateOAuthData?(redirectUri: string, originalUri?: string): OAuthData;
    getAuthUrl?(
        oauthData: OAuthData,
        opts: { prompt: 'none'; responseMode: 'query'; sessionToken: string },
    ): Promise<{ authUrl: string }>;
    parseFromUrl?(
        url: string,
        responseMode: 'query',
    ): { code: string | null; state: string | null; error?: string; errorDescription?: string };
    getMemberTokens?(code: string, state: string, oauthData: OAuthData): Promise<Tokens>;
}

/** The SDK's PKCE login state (`generateOAuthData`). */
export interface OAuthData {
    redirectUri: string;
    originalUri: string;
    codeChallenge: string;
    codeVerifier: string;
    state: string;
}

/**
 * Load `url` in a hidden frame and resolve with the frame's address once it is at `redirectUri` (the page's own
 * origin, so the page can read it).
 */
export type RedirectFrame = (
    url: string,
    redirectUri: string,
    timeoutMs: number,
) => Promise<string>;

export const hiddenRedirectFrame: RedirectFrame = (url, redirectUri, timeoutMs) =>
    new Promise((resolve, reject) => {
        const frame = document.createElement('iframe');
        frame.style.display = 'none';
        frame.src = url;
        const started = Date.now();
        const done = () => {
            clearInterval(timer);
            frame.remove();
        };
        const timer = setInterval(() => {
            let href: string | undefined;
            try {
                href = frame.contentWindow?.location.href; // throws while the frame is on Wix's origin
            } catch {
                href = undefined;
            }
            if (href?.startsWith(redirectUri)) {
                done();
                resolve(href);
            } else if (Date.now() - started > timeoutMs) {
                done();
                reject(new Error('The member login did not return to the site'));
            }
        }, 50);
        document.body.append(frame);
    });

/**
 * The member tokens of a login's session token, by an authorization code Wix returns to `redirectUri` (one of the
 * OAuth app's allowed redirect URIs on the site) in a hidden frame. The SDK's `getMemberTokensForDirectLogin`
 * waits for Wix's authorize page to `postMessage` the code to each of the app's allowed domains instead, which
 * never arrives when they are stored as hosts (`site.example`): `postMessage` refuses a target origin without a
 * scheme, and the page stops at the first one.
 */
export async function memberTokensByRedirect(
    auth: Required<
        Pick<
            DirectLoginAuth,
            'generateOAuthData' | 'getAuthUrl' | 'parseFromUrl' | 'getMemberTokens'
        >
    >,
    sessionToken: string,
    redirectUri: string,
    frame: RedirectFrame = hiddenRedirectFrame,
): Promise<Tokens> {
    const oauthData = auth.generateOAuthData(redirectUri);
    const { authUrl } = await auth.getAuthUrl(oauthData, {
        prompt: 'none',
        responseMode: 'query',
        sessionToken,
    });
    const returned = await frame(authUrl, redirectUri, 30_000);
    const { code, state, error, errorDescription } = auth.parseFromUrl(returned, 'query');
    if (error || !code || !state)
        throw new Error(errorDescription || error || 'No authorization code in the login redirect');
    return auth.getMemberTokens(code, state, oauthData);
}

/** The SDK's `StateMachine` result of login, register and processVerification. */
export interface SdkLoginState {
    loginState:
        | 'SUCCESS'
        | 'INITIAL'
        | 'FAILURE'
        | 'EMAIL_VERIFICATION_REQUIRED'
        | 'OWNER_APPROVAL_REQUIRED'
        | 'USER_CAPTCHA_REQUIRED'
        | 'SILENT_CAPTCHA_REQUIRED';
    data?: { sessionToken?: string; stateToken?: string };
    error?: string;
    errorCode?: MemberAuthErrorCode;
}

export type MemberAuthErrorCode =
    | 'invalidEmail'
    | 'invalidPassword'
    | 'resetPassword'
    | 'emailAlreadyExists'
    | 'missingCaptchaToken'
    | 'invalidCaptchaToken';

export type MemberAuthResult =
    /** Logged in: member tokens are set. */
    | { status: 'success' }
    /** Wix emailed a code: pass it to `verifyEmail`. */
    | { status: 'emailVerificationRequired' }
    /** Signed up, but the site owner approves new members first. */
    | { status: 'ownerApprovalRequired' }
    /** The site asks for a reCAPTCHA answer: retry with one. */
    | { status: 'captchaRequired' }
    | { status: 'failure'; errorCode?: MemberAuthErrorCode; error: string };

export interface DirectLoginOptions {
    /** The visitor's reCAPTCHA answer, when the site asks for one. */
    captchaToken?: string;
}

export interface RegisterOptions extends DirectLoginOptions {
    /** Join the site's community with a public profile (the "public profile" checkbox of the Wix dialog). */
    publicProfile?: boolean;
    nickname?: string;
}

export interface DirectLogin {
    login(email: string, password: string, options?: DirectLoginOptions): Promise<MemberAuthResult>;
    register(email: string, password: string, options?: RegisterOptions): Promise<MemberAuthResult>;
    /** Complete a login or sign-up that returned `emailVerificationRequired`. */
    verifyEmail(code: string): Promise<MemberAuthResult>;
    /** Email the member a link to reset their password, returning to `redirectUri`. */
    sendPasswordReset(email: string, redirectUri: string): Promise<void>;
}

/**
 * @param onMemberTokens called with the member tokens of a successful login, to keep them (see the client
 *   context's `setTokens`) and refresh the member state.
 */
export function createDirectLogin(
    auth: DirectLoginAuth,
    onMemberTokens: (tokens: Tokens) => Promise<void>,
    options: { redirectUri?: string; frame?: RedirectFrame } = {},
): DirectLogin {
    let pending: SdkLoginState | undefined;
    const { generateOAuthData, getAuthUrl, parseFromUrl, getMemberTokens } = auth;
    const memberTokens = (sessionToken: string) =>
        options.redirectUri && generateOAuthData && getAuthUrl && parseFromUrl && getMemberTokens
            ? memberTokensByRedirect(
                  { generateOAuthData, getAuthUrl, parseFromUrl, getMemberTokens },
                  sessionToken,
                  options.redirectUri,
                  options.frame,
              )
            : auth.getMemberTokensForDirectLogin(sessionToken);

    async function settle(state: SdkLoginState): Promise<MemberAuthResult> {
        pending = undefined;
        switch (state.loginState) {
            case 'SUCCESS': {
                const sessionToken = state.data?.sessionToken;
                if (!sessionToken)
                    return { status: 'failure', error: 'No session token in the login response' };
                await onMemberTokens(await memberTokens(sessionToken));
                return { status: 'success' };
            }
            case 'EMAIL_VERIFICATION_REQUIRED':
                pending = state;
                return { status: 'emailVerificationRequired' };
            case 'OWNER_APPROVAL_REQUIRED':
                return { status: 'ownerApprovalRequired' };
            case 'USER_CAPTCHA_REQUIRED':
            case 'SILENT_CAPTCHA_REQUIRED':
                return { status: 'captchaRequired' };
            default:
                if (state.errorCode === 'missingCaptchaToken') return { status: 'captchaRequired' };
                return {
                    status: 'failure',
                    errorCode: state.errorCode,
                    error: state.error || 'Login failed',
                };
        }
    }

    const captchaTokens = (options?: DirectLoginOptions) =>
        options?.captchaToken ? { captchaTokens: { recaptchaToken: options.captchaToken } } : {};

    return {
        async login(email, password, options) {
            return settle(await auth.login({ email, password, ...captchaTokens(options) }));
        },
        async register(email, password, options) {
            const profile = {
                ...(options?.nickname ? { nickname: options.nickname } : {}),
                ...(options?.publicProfile !== undefined
                    ? {
                          privacyStatus: options.publicProfile
                              ? ('PUBLIC' as const)
                              : ('PRIVATE' as const),
                      }
                    : {}),
            };
            return settle(
                await auth.register({
                    email,
                    password,
                    ...(Object.keys(profile).length ? { profile } : {}),
                    ...captchaTokens(options),
                }),
            );
        },
        async verifyEmail(code) {
            if (!pending)
                return { status: 'failure', error: 'No login is waiting for an email code' };
            return settle(await auth.processVerification({ verificationCode: code }, pending));
        },
        sendPasswordReset(email, redirectUri) {
            return auth.sendPasswordResetEmail(email, redirectUri);
        },
    };
}
