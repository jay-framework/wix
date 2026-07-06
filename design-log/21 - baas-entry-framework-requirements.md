# Design Log 21: BaaS Entry — Framework Requirements

## Status

Draft

## Background

DL#20 validated that Wix BaaS works: ESM, `/tmp` writable, 900 MB memory, Wix CLI deploys. The golf PoC proves the fetch handler works but produces a 54 MB bundle by inlining everything. We need a small `entry.mjs` (~4-5 MB) that loads backend files from Wix data collections on demand.

The framework already has the right architecture — `createJayFetchHandler` in `@jay-framework/jay-fetch-handler` delegates to `@jay-framework/production-server` which uses `FilesystemArtifactStore` to read files. The problem: the golf PoC couldn't use these packages directly because they pull in build-time dependencies (Vite, compilers) and assume a local filesystem.

## Problem

We need the framework to expose its serve functionality as composable, importable modules that `entry.mjs` can use, with the ability to inject a custom file provider that intercepts filesystem reads to fetch from Wix data collections.

## Requirements

### R1: ArtifactStore as an Interface

Currently `FilesystemArtifactStore` is a concrete class. The serve logic (`fetchPageRequest`, `matchRequest`, etc.) takes it as a parameter but types it concretely.

**Requirement:** Extract an `ArtifactStore` interface and accept it in all serve functions. This lets BaaS provide a custom implementation.

```typescript
// The interface the serve logic needs
interface ArtifactStore {
    readManifest(): Promise<RouteManifest>;
    readPreRenderedHtml(relativePath: string): Promise<PreRenderedEntry>;
    loadServerElement(relativePath: string): Promise<ServerElementModule>;
    loadPageModule(relativePath: string): Promise<PageModule>;
    readRawFile(relativePath: string): Promise<string>;
    getAssetPath(relativePath: string): string;
    getBuildDir(): string;
}

// Existing implementation stays
class FilesystemArtifactStore implements ArtifactStore { ... }

// BaaS implementation
class WixDataArtifactStore implements ArtifactStore {
    // Eager files loaded on init, lazy files fetched on demand
    // All files cached to /tmp after first fetch
}
```

### R2: createJayFetchHandler Accepts Custom ArtifactStore

Currently `createJayFetchHandler` creates a `FilesystemArtifactStore` internally from `backendDir`.

**Requirement:** Accept an `ArtifactStore` instance as an alternative to `backendDir`.

```typescript
interface JayFetchHandlerOptions {
  // Option A: filesystem path (existing)
  backendDir?: string;
  // Option B: custom artifact store (new)
  artifactStore?: ArtifactStore;

  staticBaseUrl?: string;
  frontendDir?: string;
}
```

When `artifactStore` is provided, use it directly. When `backendDir` is provided, create `FilesystemArtifactStore` as before.

### R3: Production Server Without Build Dependencies

The golf PoC had to stub out compiler packages (`@jay-framework/compiler-jay-html`, `compiler-shared`, `compiler-jay-stack`, `typescript`, `prettier`) because `production-server` imports them for the build/renderer concern.

**Requirement:** The serve-only exports of `production-server` must not pull in build-time dependencies. This means either:

- (a) Separate entry points: `@jay-framework/production-server/serve` (no build deps) vs `@jay-framework/production-server` (full)
- (b) Dynamic imports for build-only code (lazy loaded only when `--role=renderer`)
- (c) Split into two packages: `production-server-core` (serve) and `production-server` (build + serve)

Option (a) is least disruptive — add a `/serve` export that re-exports only the serve functions.

### R4: initializeServices Without Filesystem Discovery

`initializeServices(backendDir, projectRoot, label)` currently discovers and imports plugin init modules from the filesystem (`backendDir/server/init.js`, plugin packages).

**Requirement:** Allow passing pre-imported init modules directly, so esbuild can bundle them into `entry.mjs`:

```typescript
// Current: discovers from filesystem
await initializeServices(backendDir, cwd, 'FetchHandler');

// New: pre-imported modules (for bundled entry.mjs)
await initializeServicesFromModules(
  [
    { name: 'wix-server-client', init: wixServerClientInit },
    { name: 'wix-stores', init: wixStoresInit },
    { name: 'wix-cart', init: wixCartInit },
  ],
  'FetchHandler',
);
```

This is what the golf PoC already does manually — the framework should support it.

### R5: registerActionsFromManifest Without Filesystem

Similarly, `registerActionsFromManifest` imports action modules from the filesystem.

**Requirement:** Allow passing pre-imported action modules:

```typescript
// Current: loads from filesystem
await registerActionsFromManifest(manifest.actions, backendDir);

// New: pre-imported modules
await registerActionsFromModules([{ module: wixStoresModule, name: 'wix-stores' }]);
```

### R6: Page Parts Module Registry

`getPageParts` calls `loadPagePartsFromConfig(configPath, buildDir)` which does `import(entry.modulePath)` for npm-source entries (e.g. `import('@jay-framework/wix-stores')`). This forces the BaaS entry to ship a full `node_modules/` tree alongside `entry.mjs` — 400+ MB of transitive Wix SDK dependencies — just so Node can resolve those dynamic imports at runtime. The modules are already bundled into `entry.mjs` by esbuild; the dynamic import loads them a second time from disk.

**Requirement:** `loadPagePartsFromConfig` (or `getPageParts`) should accept an optional module registry — a `Record<string, module>` keyed by package name. When provided, npm-source entries look up `entry.modulePath` in the registry instead of calling `import()`. Filesystem-based deployments continue to work unchanged (no registry → dynamic import as before).

**Where to thread it:** The registry needs to reach `loadPagePartsFromConfig`. Options:

- (a) Add `moduleRegistry` to the `ArtifactStore` interface — cleanest, since page-parts already uses `artifacts.getAssetPath()` and `artifacts.getBuildDir()`
- (b) Pass it through `fetchPageRequest` → `getPageParts` → `loadPagePartsFromConfig` as an extra parameter
- (c) Module-level `setModuleRegistry(registry)` function, called once at init — simplest change, matches how `registerActionsFromModules` works

Option (c) is least disruptive — one new exported function, no interface changes.

```typescript
// New export from @jay-framework/production-server/serve
export function setPagePartsModuleRegistry(registry: Record<string, Record<string, unknown>>): void;

// Inside loadPagePartsFromConfig, the change is minimal:
async function importModule(entry) {
  if (entry.source === 'local') {
    return import(path.join(buildDir, entry.modulePath));
  }
  if (moduleRegistry && moduleRegistry[entry.modulePath]) {
    return moduleRegistry[entry.modulePath];
  }
  return import(entry.modulePath);
}
```

**How entry.mjs uses it:**

```typescript
import { setPagePartsModuleRegistry } from '@jay-framework/production-server/serve';
import * as wixStoresModule from '@jay-framework/wix-stores';
import * as wixCartModule from '@jay-framework/wix-cart';

// Called once during initialize(), before any requests
setPagePartsModuleRegistry({
  '@jay-framework/wix-stores': wixStoresModule,
  '@jay-framework/wix-cart': wixCartModule,
});
```

The entry builder already generates these `import * as pluginModule_N` statements and a `registryEntries` map — it just isn't wired up yet because this function doesn't exist.

**Impact:** Eliminates the 400+ MB `dist/node_modules/` copy. The entry.mjs (~2.4 MB) becomes fully self-contained with its bundled modules.

### R7: URL-Safe Frontend Asset Paths — IMPLEMENTED

The build now uses URL-encoded brackets (`%5Bslug%5D`) in frontend output paths. CDNs decode these transparently. Manifest paths and actual files on disk match.

## How entry.mjs Would Look

With these requirements met:

```typescript
import { createJayFetchHandler } from '@jay-framework/jay-fetch-handler';
import { WixDataArtifactStore } from '@jay-framework/wix-baas-adapter';

// Pre-imported plugin modules (bundled by esbuild)
import { init as wixServerClientInit } from '@jay-framework/wix-server-client';
import { init as wixStoresInit } from '@jay-framework/wix-stores';
import { init as wixCartInit } from '@jay-framework/wix-cart';
import * as wixStoresModule from '@jay-framework/wix-stores';

const artifactStore = new WixDataArtifactStore({
  collectionId: 'jay-backend-files',
  cacheDir: '/tmp/jay-backend',
  // Wix client auth for data collection access
  apiKey: process.env.WIX_API_KEY,
  siteId: process.env.WIX_SITE_ID,
});

const handler = createJayFetchHandler({
  artifactStore,
  staticBaseUrl: 'https://static.parastorage.com/services/my-app/1.0.0/',
  plugins: [
    { name: 'wix-server-client', init: wixServerClientInit },
    { name: 'wix-stores', init: wixStoresInit },
    { name: 'wix-cart', init: wixCartInit },
  ],
  actionModules: [wixStoresModule],
});

export default { fetch: handler };
```

This is ~4-5 MB when bundled (framework + SDK code). Backend files (server elements, pre-rendered pages, manifests) are fetched from the data collection by `WixDataArtifactStore` on demand and cached to `/tmp`.

## WixDataArtifactStore Behavior

```
readManifest():
  1. Check /tmp/jay-backend/route-manifest.json
  2. If missing → fetch from data collection (category: 'eager')
  3. Write to /tmp, return parsed manifest
  4. On subsequent calls: check version in data collection, reload if changed

readPreRenderedHtml(path):
  1. Check /tmp/jay-backend/{path} (cache.json too)
  2. If missing → fetch from data collection by path key
  3. Write to /tmp, return parsed entry
  4. Cache hit → return directly from /tmp

loadServerElement(path):
  1. Ensure file exists at /tmp/jay-backend/{path}
  2. If missing → fetch from data collection, write to /tmp
  3. import('/tmp/jay-backend/{path}') → return module

loadPageModule(path):
  Same as loadServerElement — fetch-to-tmp-then-import
```

## Implementation Plan

### Phase 1: ArtifactStore Interface (framework)

- Extract interface from `FilesystemArtifactStore`
- Update `fetchPageRequest` and other serve functions to accept the interface
- Update `createJayFetchHandler` to accept `artifactStore` option

### Phase 2: Serve-Only Exports (framework)

- Add `@jay-framework/production-server/serve` entry point
- Re-export only serve functions, no build-time dependencies
- Verify esbuild can bundle it without stubs

### Phase 3: Pre-imported Init/Actions (framework)

- Add `initializeServicesFromModules` function
- Add `registerActionsFromModules` function
- Update `createJayFetchHandler` to accept `plugins` and `actionModules` options

### Phase 4: WixDataArtifactStore (wix package)

- Create `@jay-framework/wix-baas-adapter` package
- Implements `ArtifactStore` with data collection backend + /tmp cache
- Eager/lazy loading strategy

### Phase 5: Entry Builder (wix package)

- CLI command or build script that generates `entry.mjs`
- Auto-discovers plugins and actions from the project
- Bundles with esbuild, stubs build-time deps
- Outputs to `dist/entry.mjs` for Wix CLI deployment

## Trade-offs

| Decision                 | Benefit                                                           | Cost                                           |
| ------------------------ | ----------------------------------------------------------------- | ---------------------------------------------- |
| ArtifactStore interface  | Clean abstraction, testable, swappable backends                   | One more abstraction layer                     |
| Separate `/serve` export | No build deps in entry.mjs, no stubs needed                       | Must maintain two entry points                 |
| Pre-imported modules     | esbuild can bundle everything, no filesystem discovery at runtime | Must list plugins explicitly in entry template |
| /tmp cache               | Fast after first fetch, survives within pod lifetime              | Lost on cold start, must re-fetch              |

## Framework Response: DL#143 Implementation Summary

The framework implemented DL#143 in response to our requirements. All critical requirements (R1-R5) are implemented. Packages synced to this monorepo.

### R1: ArtifactStore Interface — IMPLEMENTED

```typescript
// @jay-framework/production-server/serve
export interface ArtifactStore {
  readManifest(): Promise<RouteManifest>;
  readPreRenderedHtml(relativePath: string): Promise<PreRenderedEntry>;
  loadServerElement(relativePath: string): Promise<ServerElementModule>;
  getAssetPath(relativePath: string): string;
  getBuildDir(): string;
}
```

Smaller than proposed — `loadPageModule()` and `readRawFile()` removed as unused by serve pipeline.

### R2: createJayFetchHandler Accepts Custom ArtifactStore — IMPLEMENTED

```typescript
interface JayFetchHandlerOptions {
  backendDir?: string; // filesystem (existing)
  artifactStore?: ArtifactStore; // custom store (new)
  staticBaseUrl?: string;
  frontendDir?: string;
  plugins?: PreImportedPlugin[];
  actionModules?: Array<{ module: Record<string, unknown>; name: string }>;
}
```

Falls back to `FilesystemArtifactStore` when only `backendDir` provided.

### R3: Serve-Only Export — IMPLEMENTED

New entry point: `@jay-framework/production-server/serve`

Exports only serve functions — no build deps (Vite, compilers, TypeScript). BaaS entry.mjs imports from this path. Self-hosted deployments continue using the main export.

### R4: initializeServicesFromModules — IMPLEMENTED

```typescript
export interface PreImportedPlugin {
  name: string;
  init: { _serverInit: () => Promise<any> };
}

await initializeServicesFromModules(plugins, 'FetchHandler');
```

`createJayFetchHandler` uses this when `plugins` option is provided.

### R5: registerActionsFromModules — IMPLEMENTED

```typescript
await registerActionsFromModules([{ module: wixStoresModule, name: 'wix-stores' }]);
```

`createJayFetchHandler` uses this when `actionModules` option is provided.

### R6: Module Loading via ArtifactStore — IMPLEMENTED

Framework added `loadModule(modulePath: string, isLocal: boolean)` to the `ArtifactStore` interface. All module loading in `loadPagePartsFromConfig` and `loadServerElement` now goes through `artifacts.loadModule()` instead of direct `import()`.

`FilesystemArtifactStore.loadModule` tries local filesystem first, falls back to `import()` for npm packages. `WixDataArtifactStore.loadModule` checks a pre-built module registry (bundled by esbuild), falling back to filesystem only for unregistered modules.

This eliminated the need for node_modules in dist/ entirely — down from 426 MB to 0.

### What We Still Need to Build (wix side)

1. ~~**WixDataArtifactStore**~~ — Done. `packages/wix-deploy/lib/artifact-store.ts`
2. ~~**Entry builder**~~ — Done. `packages/wix-deploy/lib/commands/build-entry.ts`
3. ~~**Deploy pipeline**~~ — Done. `build-entry` + `upload-backend` commands + Wix CLI

### Verification

- All framework tests passing: production-server (85/85), stack-server-runtime (143/143)
- No breaking changes for self-hosted deployments
- Both paths coexist: BaaS uses `/serve` import + custom store, self-hosted uses main import + filesystem

## Implementation Deviations

**ArtifactStore interface duplicated locally.**
The production-server package doesn't export `ArtifactStore` from its main entry (no `exports` map in package.json for `/serve` sub-path). The artifact-store module duplicates the interface. To be removed once the package export is fixed.

**WixDataArtifactStore accepts WixClient, not credentials.**
DL21 proposed `apiKey`/`siteId` in options. Implementation uses a `WixClient` instance — reuses `WIX_CLIENT_SERVICE` at build time, creates from env vars at BaaS runtime. Cleaner separation.

**WixDataArtifactStore owns writes too.**
DL21 only described reads. Implementation adds `writeFile()` and `writeFiles()` methods to ensure consistent schema, ID format (`v{version}__{path}`), and versioning between upload and serve operations.

**Versioning added to all data collection items.**
Not in DL21. Items keyed by `v{version}__{path}`, queries filter by version. Supports uploading next version while serving current version.

**Entry builder reads version from build-metadata.json.**
Bakes version into the generated source as default, overridable via `JAY_BUILD_VERSION` env var at runtime.
