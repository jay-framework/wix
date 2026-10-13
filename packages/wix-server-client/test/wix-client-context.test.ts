import { beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for the SDK's OAuthStrategy client: tokens live on the instance, as in the SDK.
const created: { tokens: unknown; setTokens: (t: unknown) => void }[] = [];
vi.mock('@wix/sdk', () => ({
    OAuthStrategy: (config: { tokens?: unknown }) => config,
    createClient: ({ auth }: { auth: { tokens?: unknown } }) => {
        const client = {
            tokens: auth.tokens,
            setTokens(tokens: unknown) {
                client.tokens = tokens;
            },
        };
        created.push(client);
        return {
            auth: {
                generateVisitorTokens: async () => ({ role: 'visitor' }),
                setTokens: client.setTokens,
                getTokens: () => client.tokens,
                renewToken: async () => ({ role: 'renewed' }),
            },
        };
    },
}));

const registered: Record<string, unknown> = {};
vi.mock('@jay-framework/runtime', () => ({
    createJayContext: (name: string) => name,
    registerGlobalContext: (marker: string, value: unknown) => {
        registered[marker] = value;
    },
}));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
});

const { provideWixClientContext, WIX_CLIENT_CONTEXT } = await import('../lib/wix-client-context');
type Context = import('../lib/wix-client-context').WixClientContext;

describe('wix client context tokens', () => {
    beforeEach(() => {
        localStorage.clear();
        created.length = 0;
    });

    it('keeps tokens set through the context (e.g. a member login) for the next page load', async () => {
        await provideWixClientContext('client-1');
        const context = registered[WIX_CLIENT_CONTEXT as unknown as string] as Context;
        expect(context.getTokens()).toEqual({ role: 'visitor' });

        context.setTokens({ role: 'member' } as never);
        expect(context.getTokens()).toEqual({ role: 'member' });

        // The next page load starts a new client from storage.
        await provideWixClientContext('client-1');
        expect(created.at(-1)!.tokens).toEqual({ role: 'member' });
    });

    it('keeps a renewed access token, and the stored tokens of another OAuth client apart', async () => {
        await provideWixClientContext('client-1');
        const context = registered[WIX_CLIENT_CONTEXT as unknown as string] as Context;
        context.setTokens({ role: 'member', refreshToken: { value: 'r' } } as never);
        await context.refreshToken();
        expect(context.getTokens()).toEqual({ role: 'renewed' });

        await provideWixClientContext('client-2');
        expect(created.at(-1)!.tokens).toEqual({ role: 'visitor' });
        await provideWixClientContext('client-1');
        expect(created.at(-1)!.tokens).toEqual({ role: 'renewed' });
    });
});
