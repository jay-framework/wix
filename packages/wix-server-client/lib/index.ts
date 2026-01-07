// Export config-related types and functions
export { loadConfig, type WixConfig, type ApiKeyConfig, type OAuthConfig } from "./config-loader.js";

export {WIX_CLIENT_SERVICE, type WixClientService} from "./wix-client-service.js";

// Export client context (for dependent plugins to use)
export { WIX_CLIENT_CONTEXT, type WixClientContext } from './wix-client-context.js';

// Export init
export { 
    init,
} from './init.js';
