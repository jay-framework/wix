/** A social login provider the Wix-hosted login can go to directly (the SDK's well-known IdP connections). */
export type SocialLoginProvider = 'google' | 'facebook';

/**
 * The SDK's auth URL options for the Wix-hosted login: with a provider, the login goes straight to its sign-in
 * (as the Wix site members dialog's Google and Facebook buttons do) instead of Wix's own Log In page.
 */
export function hostedLoginOptions(idp?: SocialLoginProvider): { prompt: 'login'; responseMode: 'query'; idp?: SocialLoginProvider } {
    return { prompt: 'login', responseMode: 'query', ...(idp ? { idp } : {}) };
}
