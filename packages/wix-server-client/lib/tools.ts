// Tools entry (DL#179): compiler-allowed, toolchain-only surfaces (validators/commands/agent-kit/
// setup). Loaded via the `./tools` export by the Jay toolchain; never by the serve path (`.`).
export { setupWixServerClient } from './setup.js';

// devOnly actions (DL #38) — excluded from production, may run under the toolchain
export { getDashboardUrl } from './actions/get-dashboard-url.js';
