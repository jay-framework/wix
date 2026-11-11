// Tools entry (DL#179): compiler-allowed, toolchain-only surfaces (validators/commands/agent-kit/
// setup). Loaded via the `./tools` export by the Jay toolchain; never by the serve path (`.`).
export { setupWixServerClient } from './setup.js';
export {
    ensureWixLogin,
    getWixToken,
    listSiteAppInstances,
    installSiteApp,
    ensureSiteAppInstalled,
    type SiteAppInstance,
    type SiteAppStatus,
} from './wix-cli.js';
export { readWixConfig, type WixConfigFile } from './wix-config-file.js';

// devOnly actions (DL #38) — excluded from production, may run under the toolchain
export { getDashboardUrl } from './actions/get-dashboard-url.js';
