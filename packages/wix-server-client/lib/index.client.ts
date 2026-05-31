/**
 * Client-side exports for wix-server-client plugin.
 *
 * Provides OAuth-authenticated Wix client for browser use.
 */

export { WIX_CLIENT_CONTEXT, type WixClientContext } from './wix-client-context';

// Export init and client context
export { init } from './init.js';

// Export REST API helper (Design Log #22)
export { wixFetch, WixApiError, type WixFetchOptions } from './wix-fetch.js';
