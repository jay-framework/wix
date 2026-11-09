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
                // As the SDK's OAuthStrategy: an expired access token is renewed first.
                getAuthHeaders: async () => {
                    const tokens = client.tokens as { accessToken?: { expiresAt: number } };
                    if (tokens?.accessToken && tokens.accessToken.expiresAt < nowInSeconds()) {
                        client.tokens = memberTokens('renewed-access', nowInSeconds() + 3600);
                    }
                    return { headers: {} };
                },
            },
        };
    },
}));

const syncSession = vi.fn(async (_input: unknown) => ({ ok: true }));
vi.mock('../lib/actions/session-actions.js', () => ({ syncSession }));

function nowInSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function memberTokens(accessToken: string, expiresAt: number) {
    return {
        accessToken: { value: accessToken, expiresAt },
        refreshToken: { value: 'r', role: 'member' },
    };
}

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

const { provideWixClientContext, ensureSessionFresh, WIX_CLIENT_CONTEXT } =
    await import('../lib/wix-client-context');
type Context = import('../lib/wix-client-context').WixClientContext;

describe('wix client context tokens', () => {
    beforeEach(() => {
        localStorage.clear();
        created.length = 0;
        syncSession.mockReset();
        syncSession.mockImplementation(async () => ({ ok: true }));
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

describe('wix session cookie sync (DL#42 V13, client)', () => {
    beforeEach(() => {
        localStorage.clear();
        syncSession.mockReset();
        syncSession.mockImplementation(async () => ({ ok: true }));
    });

    async function provideContext(): Promise<Context> {
        await provideWixClientContext('client-sync');
        return registered[WIX_CLIENT_CONTEXT as unknown as string] as Context;
    }

    it('should sync the session only when the stored access token changed', async () => {
        const context = await provideContext();
        const login = memberTokens('member-access', nowInSeconds() + 3600);

        context.setTokens(login as never);
        context.setTokens({ ...login } as never);
        await Promise.resolve();

        expect(syncSession.mock.calls).toEqual([[{ tokens: { accessToken: login.accessToken } }]]);
    });

    it('should renew an expired token, store it, and wait for its sync', async () => {
        const context = await provideContext();
        context.setTokens(memberTokens('expired-access', nowInSeconds() - 10) as never);
        let finishSync: () => void = () => {};
        let syncCalls = 0;
        syncSession.mockImplementation(() => {
            syncCalls++;
            if (syncCalls === 1) {
                return new Promise((resolve) => (finishSync = () => resolve({ ok: true })));
            }
            return Promise.resolve({ ok: true });
        });

        let fresh = false;
        const ensuring = ensureSessionFresh().then(() => (fresh = true));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(fresh).toBe(false);
        finishSync();
        await ensuring;

        expect((context.getTokens() as any).accessToken.value).toEqual('renewed-access');
        expect(syncSession.mock.calls.at(-1)).toEqual([
            {
                tokens: {
                    accessToken: memberTokens(
                        'renewed-access',
                        (context.getTokens() as any).accessToken.expiresAt,
                    ).accessToken,
                },
            },
        ]);
        const stored = JSON.parse(localStorage.getItem('wix_visitor_tokensclient-sync')!);
        expect(stored.tokens.accessToken.value).toEqual('renewed-access');
    });

    it('should sync a never-synced valid token before an action, once', async () => {
        const restored = memberTokens('restored-access', nowInSeconds() + 3600);
        localStorage.setItem(
            'wix_visitor_tokensclient-sync',
            JSON.stringify({ tokens: restored, oauthClientId: 'client-sync' }),
        );
        await provideContext(); // tokens restored from storage are not synced on load
        expect(syncSession).not.toHaveBeenCalled();

        await ensureSessionFresh();
        await ensureSessionFresh();

        expect(syncSession).toHaveBeenCalledTimes(1);
    });

    it('should not start the second cookie sync until the first one finishes', async () => {
        const context = await provideContext();
        await ensureSessionFresh();
        syncSession.mockClear();

        const first = memberTokens('first-access', nowInSeconds() + 3600);
        const second = memberTokens('second-access', nowInSeconds() + 7200);
        let releaseFirst: () => void = () => {};
        let syncCalls = 0;
        syncSession.mockImplementation(() => {
            syncCalls++;
            if (syncCalls === 1) {
                return new Promise((resolve) => {
                    releaseFirst = () => resolve({ ok: true });
                });
            }
            return Promise.resolve({ ok: true });
        });

        context.setTokens(first as never);
        context.setTokens(second as never);
        await Promise.resolve();
        expect(syncSession).toHaveBeenCalledTimes(1);

        releaseFirst();
        await ensureSessionFresh();
        expect(syncSession).toHaveBeenCalledTimes(2);
        expect(syncSession.mock.calls.at(-1)).toEqual([
            { tokens: { accessToken: second.accessToken } },
        ]);
    });

    it('should not throw when the sync fails, and retry it next time', async () => {
        const context = await provideContext();
        syncSession.mockRejectedValue(new Error('network down'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        context.setTokens(memberTokens('member-access', nowInSeconds() + 3600) as never);

        await expect(ensureSessionFresh()).resolves.toBeUndefined();
        syncSession.mockResolvedValue({ ok: true });
        await ensureSessionFresh();

        expect(syncSession.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(JSON.stringify(warn.mock.calls)).not.toMatch('member-access');
        warn.mockRestore();
    });
});
