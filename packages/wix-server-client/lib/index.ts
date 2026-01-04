// Export config-related types and functions
export { loadConfig, type WixConfig, type ApiKeyConfig, type OAuthConfig } from "./config-loader.js";

export {WIX_CLIENT_SERVICE, type WixClientService} from "./wix-client-service";

// Export init and client context
export { 
    init,
} from './init.js';
