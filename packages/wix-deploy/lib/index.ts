// Serve entry (DL#179): compiler-free. The artifact store runs at serve time (BaaS request path).
export { WixDataArtifactStore } from './artifact-store.js';
export type { WixDataArtifactStoreOptions } from './artifact-store.js';

// Tools-time handlers (setup, validator, commands) are moved to ./tools (DL#179) — they pull in the
// compiler / esbuild and must not enter the serve bundle.
