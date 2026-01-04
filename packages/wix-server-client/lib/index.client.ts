/**
 * Client-side exports for wix-server-client plugin.
 *
 * Provides OAuth-authenticated Wix client for browser use.
 */

// Export init and client context
export { 
    init,
    WIX_CLIENT_CONTEXT, 
    clearStoredTokens,
    type WixClientInitData,
    type WixClientContext,
} from './init.js';
