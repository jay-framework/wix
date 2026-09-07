// Tools entry (DL#179): compiler-allowed, toolchain-only surfaces (validators/commands/agent-kit/
// setup). Loaded via the `./tools` export by the Jay toolchain; never by the serve path (`.`).
// The serve-time artifact store stays on `.` (compiler-free) — see index.ts.

// Setup handler
export { setupWixDeploy } from './setup.js';

// Validator
export { validate } from './validators/static-filename-validator.js';

// CLI commands
export { buildEntry } from './commands/build-entry.js';
export { uploadBackend } from './commands/upload-backend.js';
export { deployBaas } from './commands/deploy-baas.js';
export { deploy } from './commands/deploy.js';
