/**
 * Session action (DL#40 §Design 1): mirror the browser's OAuth tokens into the httpOnly
 * `wix_session` cookie, after verifying them with token-info.
 */

import { makeJayAction } from '@jay-framework/fullstack-component';
import type { Tokens } from '@wix/sdk';
import {
    encodeSessionCookie,
    SESSION_COOKIE_OPTIONS,
    SESSION_COOKIE_SCOPE,
    WIX_SESSION_COOKIE,
} from '../session/session-cookie.js';
import { siteOAuthClientId } from '../session/site-oauth-client-id.js';
import { verifyAccessToken, type VerifiedCaller } from '../session/verify-access-token.js';

export type SyncSessionInput = { tokens: Tokens } | { clear: true };

export interface SyncSessionResult {
    ok: boolean;
    callerType?: VerifiedCaller['type'];
}

export const syncSession = makeJayAction('wixServerClient.syncSession')
    .withRequest()
    .withHandler(async (input: SyncSessionInput, request): Promise<SyncSessionResult> => {
        if ('clear' in input) {
            request.clearCookie(WIX_SESSION_COOKIE, SESSION_COOKIE_SCOPE);
            return { ok: true };
        }
        const caller = await verifyAccessToken(
            input.tokens?.accessToken?.value ?? '',
            siteOAuthClientId(),
        );
        if (!caller) {
            request.clearCookie(WIX_SESSION_COOKIE, SESSION_COOKIE_SCOPE);
            return { ok: false };
        }
        request.setCookie(WIX_SESSION_COOKIE, encodeSessionCookie(input.tokens), SESSION_COOKIE_OPTIONS);
        return { ok: true, callerType: caller.type };
    });
