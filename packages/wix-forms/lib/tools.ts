// Tools entry (DL#179): compiler-allowed, toolchain-only surfaces (validators/commands/agent-kit/
// setup). Loaded via the `./tools` export by the Jay toolchain; never by the serve path (`.`).
export { setupWixForms, setup, generateWixFormsAgentKit } from './setup.js';
export { validateWixFormBindings } from './validators/wix-form-bindings.js';
