// Tools entry (DL#179): compiler-allowed, toolchain-only surfaces (validators/commands/agent-kit/
// setup). Loaded via the `./tools` export by the Jay toolchain; never by the serve path (`.`).
export { validateAuthCallbackPage } from './validators/auth-callback-validator';
export { setupWixMembers } from './setup';
