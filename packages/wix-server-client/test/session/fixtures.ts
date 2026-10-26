import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';

/** The OAuth client id placeholder used in the Phase 1 token-info fixtures. */
export const SITE_CLIENT_ID = '<OAUTH_CLIENT_ID>';

export interface TokenInfoFixture {
    status: number;
    body: Record<string, unknown>;
}

export function tokenInfoFixture(name: string): TokenInfoFixture {
    return JSON.parse(
        readFileSync(resolve(__dirname, `../fixtures/token-info/${name}.json`), 'utf8'),
    );
}

export function fetchReturning(fixture: TokenInfoFixture) {
    return vi.fn(
        async (_url: string, _init?: RequestInit) =>
            new Response(JSON.stringify(fixture.body), { status: fixture.status }),
    );
}

export function withBody(name: string, overrides: Record<string, unknown>): TokenInfoFixture {
    const fixture = tokenInfoFixture(name);
    return { ...fixture, body: { ...fixture.body, ...overrides } };
}
