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
await initializeServicesFromModules([
    { name: 'wix-server-client', init: wixServerClientInit },
    { name: 'wix-stores', init: wixStoresInit },
    { name: 'wix-cart', init: wixCartInit },
], 'FetchHandler');
```

This is what the golf PoC already does manually — the framework should support it.

### R5: registerActionsFromManifest Without Filesystem

Similarly, `registerActionsFromManifest` imports action modules from the filesystem.

**Requirement:** Allow passing pre-imported action modules:

```typescript
// Current: loads from filesystem
await registerActionsFromManifest(manifest.actions, backendDir);

// New: pre-imported modules
await registerActionsFromModules([
    { module: wixStoresModule, name: 'wix-stores' },
]);
```

### R6: Page Parts Loading Without Filesystem

`getPageParts` loads page-parts.json and resolves module paths from the filesystem.

**Requirement:** The `ArtifactStore` interface (R1) should handle this. `getPageParts` should use the artifact store to read page-parts.json and load modules, rather than using direct `import()` with filesystem paths.

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

| Decision | Benefit | Cost |
|----------|---------|------|
| ArtifactStore interface | Clean abstraction, testable, swappable backends | One more abstraction layer |
| Separate `/serve` export | No build deps in entry.mjs, no stubs needed | Must maintain two entry points |
| Pre-imported modules | esbuild can bundle everything, no filesystem discovery at runtime | Must list plugins explicitly in entry template |
| /tmp cache | Fast after first fetch, survives within pod lifetime | Lost on cold start, must re-fetch |
