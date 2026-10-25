// Tools entry (DL#179): compiler-allowed, toolchain-only surfaces (validators/commands/agent-kit/
// setup). Loaded via the `./tools` export by the Jay toolchain; never by the serve path (`.`).
export { setupWixStores, generateWixStoresAgentKit } from './setup.js';
export { validateWixStoresProjectConfig } from './validators/wix-stores-config-validator.js';

// devOnly source-editing actions (DL #38) — write to the Stores catalog; excluded from production
export {
    getProductForEditing,
    updateProductMainImage,
    updateProductText,
} from './editing/editing-actions.js';
