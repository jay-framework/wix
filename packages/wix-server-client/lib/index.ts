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
    type WixFetchOptions,
    type WixFilter,
    type WixSort,
    type WixPaging,
    type WixCursorPaging,
} from './wix-fetch.js';
