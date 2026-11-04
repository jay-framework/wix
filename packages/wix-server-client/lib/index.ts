// Export config-related types and functions
export {
    loadConfig,
    type WixConfig,
    type ApiKeyConfig,
    type AppConfig,
    type OAuthConfig,
    type ServerAuthConfig,
} from './config-loader.js';

export { WIX_CLIENT_SERVICE, type WixClientService } from './wix-client-service.js';

// Export client context (for dependent plugins to use)
export { WIX_CLIENT_CONTEXT, type WixClientContext } from './wix-client-context.js';

// Export init
export { init } from './init.js';

// setup handler (setupWixServerClient) is tools-time — moved to ./tools (DL#179).

// Export REST API helper (Design Log #22)
export {
    wixFetch,
    WixApiError,
    isPermissionDenied,
    type WixFetchOptions,
    type WixFilter,
    type WixSort,
    type WixPaging,
    type WixCursorPaging,
} from './wix-fetch.js';

// Request session (DL#42): server-side Wix calls run as the site by default, and as the
// caller when the request carries the `wix_session` cookie.
export { syncSession, type SyncSessionInput, type SyncSessionResult } from './actions/session-actions.js';
export {
    resolveRequestIdentity,
    isExpiringSoon,
    EXPIRY_MARGIN_SECONDS,
    type RequestIdentity,
    type SessionState,
} from './session/request-identity.js';
export { verifyAccessToken, type VerifiedCaller } from './session/verify-access-token.js';
export { WIX_SESSION_COOKIE } from './session/session-cookie.js';
