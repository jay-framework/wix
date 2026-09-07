// Tools entry (DL#179): compiler-allowed, toolchain-only surfaces (validators/commands/agent-kit/
// setup) plus the devOnly settings surface (DL#180). Loaded via the `./tools` export by the Jay
// toolchain; never by the serve path (`.`).

// Validator
export { validate } from './validators/media-validator.js';

// Setup + agent-kit
export { setupWixMedia, generateWixMediaAgentKit } from './setup.js';

// CLI commands
export { rebuildIndex } from './commands/rebuild-index.js';
export { uploadPublic } from './commands/upload-public.js';

// devOnly settings actions (DL#180) — excluded from production, may run under the toolchain
export {
    getMediaSettingsStatus,
    rebuildMediaCatalog,
    listIndexedMediaBrowse,
    createMediaFolder,
    uploadMediaFile,
} from './settings-actions.js';

// devOnly settings route component (server side) — resolved from ./tools per DL#180
export { mediaSettingsPage } from './pages/settings/page.js';
