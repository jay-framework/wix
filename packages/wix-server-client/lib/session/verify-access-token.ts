/**
 * Verify a Wix OAuth access token with the documented `oauth2/token-info` endpoint
 * (DL#42 §Design 1). Server-only. Never logs: the token must not reach any log.
 */

import { WixApiError } from '../wix-fetch.js';

export interface VerifiedCaller {
    type: 'VISITOR' | 'MEMBER';
    id: string;
}

const TOKEN_INFO_URL = 'https://www.wixapis.com/oauth2/token-info';
const TOKEN_INFO_PATH = '/oauth2/token-info';
const TOKEN_INFO_TIMEOUT_MS = 5000;

/**
 * Statuses that mean "this token is invalid" rather than "token-info failed". Measured in
 * DL#42 Phase 1: made-up, non-JWT and empty tokens all answer 200 with `active:false`, so
 * the set is empty and every non-200 is a transport failure.
 */
const INVALID_TOKEN_STATUSES: ReadonlySet<number> = new Set();

/** Typed after `@wix/sdk`'s internal `getTokenInfo`. */
interface TokenInfo {
    active: boolean;
    subjectType: 'APP' | 'USER' | 'MEMBER' | 'VISITOR' | 'UNKNOWN';
    subjectId: string;
    clientId?: string;
}

export async function verifyAccessToken(
    accessToken: string,
    oauthClientId: string,
    fetchImpl: typeof fetch = fetch,
): Promise<VerifiedCaller | undefined> {
    if (!accessToken) return undefined;
    const response = await postTokenInfo(accessToken, fetchImpl);
    if (INVALID_TOKEN_STATUSES.has(response.status)) return undefined;
    if (response.status !== 200) {
        throw new WixApiError(response.status, TOKEN_INFO_PATH, '');
    }
    return callerFrom((await response.json()) as TokenInfo, oauthClientId);
}

async function postTokenInfo(accessToken: string, fetchImpl: typeof fetch): Promise<Response> {
    const abort = new AbortController();
    const timer = setTimeout(
        () => abort.abort(new Error('token-info timed out')),
        TOKEN_INFO_TIMEOUT_MS,
    );
    try {
        return await fetchImpl(TOKEN_INFO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: accessToken }),
            signal: abort.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

/** The four checks: active, this site's client, a visitor or member, a subject id. */
function callerFrom(info: TokenInfo, oauthClientId: string): VerifiedCaller | undefined {
    const isCallerSubject = info.subjectType === 'VISITOR' || info.subjectType === 'MEMBER';
    if (info.active !== true || info.clientId !== oauthClientId || !isCallerSubject || !info.subjectId) {
        return undefined;
    }
    return { type: info.subjectType as VerifiedCaller['type'], id: info.subjectId };
}
