# Design Log 20: Wix BaaS Deployment

## Status

Draft

## Background

Jay Framework apps currently run self-hosted or via CDN + server. The build produces two directories:

- `build/v{n}/frontend/` — static assets (JS bundles, CSS, public files) → served from CDN or origin
- `build/v{n}/backend/` — server code (route manifest, pre-rendered HTML, server modules, actions) → needs a Node.js runtime

For BaaS (Wix's serverless platform, a.k.a. Velo Backend), the framework already has `createJayFetchHandler()` which wraps the backend into a `(Request) → Promise<Response>` function — the exact shape BaaS expects.

The Wix CLI (`wix preview`/`wix release`) handles deployment to BaaS: it creates a deployment, uploads files, and completes it. The upload goes through the Velo Backend v1 API, which returns upload URLs for the target cloud provider (CloudFlare or Kubernetes).

## PoC Results (golf project)

A working PoC exists at `golf/scripts/build-fetch-bundle.mjs`. It bundles everything into a single `dist/entry.mjs` using esbuild. This works on BaaS but the output is **54 MB** — too large.

**Size breakdown:**
- **28.6 MB** — embedded data (pre-rendered HTML, route manifests, cache JSON inlined as JS string literals)
- **15.2 MB** — backend build artifacts (server-element modules, pre-rendered pages)
- **4.1 MB** — node_modules (Wix SDK modules, Jay framework packages)

The PoC inlines everything (manifest, pre-rendered HTML, server elements) into the generated entry file, then esbuild bundles it all. The embedded data alone is 28 MB because the golf project has many product pages × multiple instances.

**What the PoC does:**
1. Reads `build/v1/backend/route-manifest.json`
2. Reads all pre-rendered `.jay-html` + `.cache.json` files → inlines as JSON
3. Imports all server-element modules → bundles into entry
4. Imports page-parts modules → bundles into entry
5. Inlines the production server routing logic (avoids pulling in Vite)
6. Hardcodes plugin init order and action registration
7. esbuild bundles everything into one ESM file with stubs for build-time deps

**What works:** Full page rendering, actions, streaming SSR, cookie parsing, redirect responses.

**What doesn't scale:** File size. BaaS has limits and cold start suffers with a 54 MB file.

### Data Collection Exploration Results (2026-05-25)

Tested in `exploration/wix-baas-data-collection/` — uploaded golf project's backend files to a Wix data collection.

**Upload:** All ~900 files uploaded successfully via `bulkInsert` (batch size 50). Files stored as text in `content` field. Per-row limit is 512 KB — all backend files fit (largest server-element is ~40 KB).

**Fetch:** Query for 100 items by path prefix returned in **1.5s**. Items include full file content.

**Key findings:**
- Wix data collections can store the backend files — validated
- `.jay-html` files skipped (not used during serving) — reduces file count
- Images skipped (should be in CDN/media, not backend)
- If files approach 512 KB limit, can compress + base64 encode
- Single item `get` by `_id` failed (likely ID encoding issue with `__` separator) — needs investigation but query-based fetch works

**Conclusion:** Data collection approach is viable for lazy page file loading. 1.5s for 100 items is acceptable for cold start eager loading. Individual page files (~2 files per page, ~50-70 KB total) should fetch in <200ms.

## Problem

We need a deployment path from Jay Framework to Wix BaaS that splits the monolithic bundle into parts:

1. **Frontend** (`build/frontend/`) — static assets uploaded to Wix CDN (`static.parastorage.com`)
2. **Backend** (`build/backend/`) — server artifacts (pre-rendered HTML, server elements, manifests) stored externally, fetched to BaaS's in-memory disk on cold start
3. **Entry point + runtime** — small fetch handler (~4 MB) with framework + SDK code, uploaded directly to BaaS

## Questions & Answers

Q1: Should we reuse the Wix CLI for deployment, create our own deploy code, or create a plugin that prepares the project and delegates to the Wix CLI?
A: **Reuse the Wix CLI — validated.** Successfully deployed using `wix preview` / `wix release`. The CLI handles auth, upload, CDN, versioning. We prepare the output in the format it expects (see Deployment Exploration Results below).

Q2: How does the Wix CLI authenticate for deployment? Can we reuse its auth?
A: Three methods: (1) Device code OAuth flow (interactive, default), (2) API key (`--api-key`), (3) Refresh token (`--refresh-token`). Tokens stored in `~/.wix/auth/`. For CI, API key is the simplest.

Q3: What is the BaaS upload API flow? Does BaaS support multiple backend files?
A: Yes — BaaS uploads **multiple individual files**, not a single bundle. Flow:
1. `createAppDeployment({ staticFilesMetadata: [...] })` — sends metadata (path, MD5 hash, MIME type, size) for all files
2. Backend returns per-file upload URLs + auth tokens
3. Upload files: CloudFlare batches via FormData, Kubernetes uses per-file PUT
4. `completeAppDeployment()` — finalizes, also sends backend files as `{ path, content: base64 }` array

This means we can upload node_modules as individual files alongside entry.mjs — **no need to pre-bundle everything**. We just need to figure out which node_modules are actually needed at runtime.

Q4: How should the backend files reach the BaaS runtime? You mentioned storing in a data collection and fetching on demand.
A: Backend files are accessed per-page (each page has ~2 files: server-element + pre-rendered HTML/cache). Plus shared files (components, src modules) and index/manifest files. Strategy:
- **Shared files + manifests** → eagerly load on startup (small, always needed)
- **Per-page files** → lazily fetch on first request for that page, cache on in-memory disk, load from disk on subsequent requests
- Storage: Wix data collection with files stored as items, fetched individually
- **TODO: validate Wix data collections can store this volume** — create exploration to upload golf project's build/backend files

Q5: Does BaaS support `node_modules`? Or do we need to bundle everything into a single file?
A:

Q6: What's the entry point format BaaS expects?
A: `entry.mjs` exporting a default fetch function: `export default { fetch: handler }`

Q7: How does `staticBaseUrl` work? Where do frontend files get served from on Wix?
A:

Q8: Does BaaS have cold start concerns? The Jay backend needs to load route manifest, init plugins, etc.
A:

Q9: Can we use `createJayFetchHandler` directly as the BaaS entry point, or does it need adaptation?
A: Yes — `createJayFetchHandler({ backendDir })` reads files from disk at request time (lazy init on first request). The entry.mjs flow:
1. On cold start: download eager files (manifest, shared modules, actions) from data collection → write to in-memory disk at `/tmp/backend/`
2. Call `createJayFetchHandler({ backendDir: '/tmp/backend', staticBaseUrl: '...' })` → returns handler
3. On page request: handler reads page files from disk. If missing → intercept, fetch from data collection, write to disk, then let handler proceed.

Step 3 needs a mechanism to lazy-fetch page files before the handler reads them. Options:
- (a) Hook into the handler's file reads (middleware/proxy around fs)
- (b) Pre-fetch page files based on the matched route before calling the handler
- (c) Modify `createJayFetchHandler` to accept a file provider callback instead of raw disk reads

Option (b) is simplest — match the route ourselves, check if page files exist on disk, fetch if missing, then delegate to handler.

Q10: The PoC copies/rewrites a lot of code from the production server package. Can we split the production server to make reuse possible?
A: Yes. The production server currently has two concerns mixed together:
1. **Serve** — route matching, page rendering (fast phase SSR), action dispatch, streaming HTML. This is what BaaS needs.
2. **Rebuild** — watching for changes, re-rendering pages, webhook handling. This is dev/renderer only.

Split proposal:
- `@jay-framework/production-server-core` (or just refactor the existing package) — the serve concern: route matching, page rendering, action dispatch. No Vite dependency. Minimal. The PoC's inlined routing/rendering code should come from here.
- The rebuild concern stays in the existing package or a separate renderer package.

This lets `entry.mjs` import the serve logic directly instead of copy-pasting it. The PoC currently inlines ~200 lines of routing + rendering code that should be a shared module.

Q11: Why not upload all backend files directly to BaaS instead of using a data collection?
A: Two reasons:
1. **Live updates**: A second server (renderer) updates pre-rendered pages when products or CMS entries change. Updated files need to reach the serving BaaS instance. BaaS files are immutable per deployment — you can't update individual files without redeploying. A shared data collection allows the renderer to write updated pages that the serving instance picks up on next request.
2. **Decoupled versioning**: The renderer can update individual page files independently of the BaaS deployment cycle.

So even if we upload initial backend files to BaaS for fast cold start, we still need the data collection as the **authoritative source** for page files, since they change between deployments.

```
┌─────────────┐     writes updated pages     ┌──────────────────┐
│  Renderer   │ ──────────────────────────→   │  Wix Data        │
│  Server     │                               │  Collection      │
└─────────────┘                               │  (page files)    │
                                              └────────┬─────────┘
                                                       │ reads on request
                                              ┌────────▼─────────┐
                                              │  BaaS Serving    │
                                              │  Instance        │
                                              │  (entry.mjs)     │
                                              └──────────────────┘
```

## Deployment Architecture Options

### Option A: Use Wix CLI Directly

```
jay-stack build
  ↓
wix preview / wix release
  ↓
Wix CLI handles upload to BaaS
```

**How it would work:**
- Build with `jay-stack build`
- Wrap the output into a format the Wix CLI expects (wix.config.ts, file structure)
- Run `wix preview` or `wix release` to deploy

**Pros:**
- Wix CLI handles auth, upload, CDN, versioning
- Maintained by Wix team
- Handles CloudFlare/K8s upload strategies automatically

**Cons:**
- Wix CLI expects a specific project structure (Velo conventions)
- May not support custom backend file serving (data collection → disk)
- Coupling to Wix CLI versioning and internals
- May need significant shims to make Jay's output look like a Wix app

### Option B: Own Deploy Code

```
jay-stack build
  ↓
jay-stack run wix-deploy/publish
  ↓
Custom code: auth → createAppDeployment() → upload → completeAppDeployment()
```

**How it would work:**
- Build with `jay-stack build`
- A `wix-deploy` plugin CLI command handles the full deployment
- Directly calls the Velo Backend v1 API
- Manages auth (reuse `~/.wix/auth/` tokens or own API key config)

**Pros:**
- Full control over what gets uploaded and how
- Can implement the data collection strategy for backend files
- No dependency on Wix CLI internals
- Can optimize for Jay's specific needs

**Cons:**
- Must implement upload logic (CloudFlare FormData, JWT auth)
- Must track Wix API changes ourselves
- More code to maintain

### Option C: Plugin Prepares, Wix CLI Deploys

```
jay-stack build
  ↓
jay-stack run wix-deploy/prepare
  ↓
Transforms build output into Wix CLI-compatible structure
  ↓
wix preview / wix release
```

**How it would work:**
- Build with `jay-stack build`
- A prepare command restructures the output to look like a Wix app
- Generate `wix.config.ts`, entry points, etc.
- User runs Wix CLI to deploy

**Pros:**
- Leverages Wix CLI for the hard parts (upload, CDN, versioning)
- Clear separation: Jay builds, Wix deploys
- Auth handled by Wix CLI

**Cons:**
- Two-step process (prepare + deploy)
- Still constrained by what Wix CLI expects
- May not support the data collection strategy for backend files
- Fragile if Wix CLI's expected format changes

## Three-Part Deployment Design

Regardless of which option we choose, the deployment has three parts:

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Frontend (static assets)                                  │
│                                                              │
│ build/v{n}/frontend/                                         │
│   ├── shared/*.js          ─┐                                │
│   ├── pages/**/*.js, *.css  ├→ Upload to Wix CDN             │
│   └── public/**             ─┘   (static.parastorage.com)    │
│                                                              │
│ Served via: staticBaseUrl = https://static.parastorage.com/  │
│             services/{app-name}/{version}/                   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ 2. Backend (server artifacts) → Wix data collection          │
│                                                              │
│ Eager (loaded on cold start):                                │
│   ├── route-manifest.json     # Routes, segments, params     │
│   ├── build-metadata.json     # Version info                 │
│   ├── server/init.js          # Plugin initialization        │
│   ├── server/components/*.js  # Shared component modules     │
│   └── server/actions/*.js     # Action handlers              │
│                                                              │
│ Lazy (fetched on first request for that page):               │
│   ├── pre-rendered/{route}/page.cache.json                   │
│   ├── pre-rendered/{route}/page.server-element.js            │
│   └── pre-rendered/{route}/page-parts.json                   │
│                                                              │
│ Flow:                                                        │
│   Request for /products/shoes →                              │
│   1. Check in-memory disk cache                              │
│   2. If miss → fetch from data collection                    │
│   3. Write to in-memory disk                                 │
│   4. Render using cached files                               │
│                                                              │
│ The data collection is the AUTHORITATIVE source —            │
│ the renderer server writes updated pages here when           │
│ products/CMS data changes. The BaaS instance always          │
│ reads from the collection (with disk caching).               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ 3. BaaS Entry Point (entry.mjs) → uploaded to BaaS           │
│                                                              │
│ Small bundle (~4-5 MB):                                      │
│   ├── @jay-framework/jay-fetch-handler (createJayFetchHandler)│
│   ├── Jay framework runtime                                  │
│   ├── Wix SDK modules                                        │
│   └── Data collection client (fetch backend files)           │
│                                                              │
│ import { createJayFetchHandler } from '...';                 │
│                                                              │
│ let jayHandler;                                              │
│                                                              │
│ async function ensureReady() {                               │
│   if (jayHandler) return;                                    │
│   // 1. Fetch eager files from data collection → /tmp/backend│
│   await downloadEagerFiles('/tmp/backend');                   │
│   // 2. Create handler pointing at disk                      │
│   jayHandler = createJayFetchHandler({                       │
│     backendDir: '/tmp/backend',                              │
│     staticBaseUrl: 'https://static.parastorage.com/...',     │
│   });                                                        │
│ }                                                            │
│                                                              │
│ export default {                                             │
│   fetch: async (request) => {                                │
│     await ensureReady();                                     │
│     // 3. Match route, lazy-fetch page files if missing      │
│     await ensurePageFiles(request.url, '/tmp/backend');       │
│     return jayHandler(request);                              │
│   }                                                          │
│ };                                                           │
└──────────────────────────────────────────────────────────────┘
```

### Why Split the Bundle?

The PoC proves the single-file approach works but doesn't scale:

| Part | Golf PoC size | What it contains |
|------|--------------|------------------|
| Embedded data | 28.6 MB | Pre-rendered HTML, manifests, cache JSON |
| Backend modules | 15.2 MB | Server elements, page-parts modules |
| Runtime + SDK | 4.1 MB | Jay framework, Wix SDK, routing logic |
| **Total** | **54 MB** | Everything in one file |

With the three-part split:

| Part | Target size | Upload target | When loaded |
|------|------------|---------------|-------------|
| Frontend | varies | Wix CDN | Browser requests |
| Backend archive | ~15-20 MB | Wix data collection or Media Manager | BaaS cold start |
| Entry point | ~4-5 MB | BaaS directly | Always loaded |

The entry point stays small (~4 MB) — fast cold start. Backend files are fetched once to in-memory disk and cached for the instance lifetime.

## Implementation Plan

### Phase 0: Production Server Refactor (framework)
- Split production server into serve concern (core) and rebuild concern (renderer)
- Core module: route matching, page rendering (fast phase SSR), action dispatch, streaming HTML
- No Vite dependency in core — must be bundleable by esbuild
- The PoC's inlined ~200 lines of routing/rendering logic should come from this module
- Verify the golf PoC can import core instead of inlining

### Phase 1: Exploration
- **Data collection capacity**: create exploration to upload golf project's `build/backend/` files to a Wix data collection — validate it can store hundreds of files
- **BaaS multi-file support**: test if BaaS accepts multiple files alongside entry.mjs, or only a single file
- **Lazy loading**: prototype fetching individual page files from data collection on demand, writing to in-memory disk
- **Cold start**: measure time for eager load (shared files) + first page request (lazy load)
- **Wix CLI compatibility**: test if `wix preview`/`wix release` can deploy a Jay-prepared project

### Phase 2: Entry Point
- Create `@jay-framework/wix-baas-entry` package
- Uses production-server-core for routing/rendering (no copy-paste)
- Data collection client for eager + lazy file fetching
- In-memory disk cache management
- `export default { fetch: handler }` format

### Phase 3: Deploy Plugin
- Prepare command: transforms `jay-stack build` output into Wix CLI-compatible structure
- Upload backend files to Wix data collection (per-file, with metadata for eager vs lazy)
- Frontend files → Wix CDN (via Wix CLI or direct upload)
- Entry point → BaaS (via Wix CLI)

### Phase 4: Example Integration
- Deploy golf or whisky-exchange to BaaS using the full pipeline
- Verify: page rendering, actions, static assets from CDN, lazy page loading, cold start time
- Compare performance: single-bundle PoC vs three-part split

## Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Backend in data collection | No BaaS file limits, versioned | Cold start latency for fetch |
| Own deploy code (Option B) | Full control, optimized for Jay | More to maintain |
| Wix CLI delegation (Option C) | Less code, Wix-maintained | Constrained by CLI format |
| Bundled node_modules | Faster cold start, no npm install | Larger upload, bundle complexity |
| createJayFetchHandler as entry | Already exists, tested | May need BaaS-specific adaptations |

## Relationship to DL#134 (Production Build)

This design log adapts the two-server architecture from DL#134 (`jay/design-log/134 - production build.md`) to Wix BaaS:

| DL#134 Concept | Self-Hosted | Wix BaaS Adaptation |
|----------------|-------------|---------------------|
| Main server | Node.js process, reads from local `build/` dir | BaaS entry.mjs, reads from in-memory disk (fetched from data collection) |
| Renderer server | `jay-stack serve --role=renderer`, writes to local `build/` dir | Separate BaaS instance or external server, writes to Wix data collection |
| Artifact storage | Local filesystem (`build/v{n}/`) | Wix data collection (authoritative) + in-memory disk (cache) |
| Data change | Renderer updates files, main server detects via mtime on `build-metadata.json` | Renderer writes to data collection, serving instance invalidates cache (poll or version check) |
| Static assets | CDN or self-served | Wix CDN (`static.parastorage.com`) |
| Plugin init | `_serverInit()` runs at startup | Same, runs during `ensureReady()` in entry.mjs |
| Actions | Action router in main server | Same, via `createJayFetchHandler` |
| Versioned buckets | `build/v1/`, `build/v2/` on disk | Version field in data collection items, or separate collections per version |

### Cache Invalidation on BaaS

DL#134 uses `build-metadata.json` mtime polling — main server re-reads manifest when metadata file changes. On BaaS, the equivalent:

1. Serving instance caches a version number from the data collection
2. On each request (or with a TTL), checks if the version has changed
3. If changed: re-fetches eager files (manifest, shared modules), clears page file cache
4. Lazy page files are re-fetched on next request for that page

This matches DL#134's approach: "main server reads artifacts from the artifact storage service on each request... reads from files each time."

## Deployment Exploration Results (2026-05-26)

Tested in `exploration/wix-baas-deploy/` — successfully deployed a minimal fetch handler to Wix BaaS.

### Setup Steps

1. **Initialize project**: `npm create @wix/new@latest init` — creates `wix.config.json`
2. **Configure output directories** in `wix.config.json`:
   ```json
   {
     "site": {
       "outputDirectory": {
         "client": "./build/v1/frontend",
         "server": "./dist"
       }
     }
   }
   ```
3. **Install Wix CLI** globally (internal build, public release pending)
4. **Deploy**: `wix preview` (test) or `wix release` (production)

### Key Requirements

- Must have at least one file in the `client` (frontend) directory
- `entry.mjs` must be in the `server` directory, exporting `default { fetch: handler }`
- The `wix.config.json` `site.outputDirectory` tells the CLI where to find build artifacts

### What Works

- Wix CLI handles: auth, file upload, CDN hosting, deployment lifecycle
- No need for custom ambassador API calls — the CLI does it all
- `wix preview` for test deployments, `wix release` for production

### Implications for Jay Deployment

The Jay deploy plugin (Option C from above) becomes:
1. `jay-stack build` → produces `build/v1/frontend/` and `build/v1/backend/`
2. Plugin prepares: bundles `entry.mjs` from backend + framework into `dist/`
3. Configure `wix.config.json` to point at the right directories
4. User runs `wix preview` or `wix release`

The entry.mjs bundling (step 2) is what the golf PoC already does, minus the 54 MB problem. With the three-part split (frontend on CDN, backend in data collection, small entry.mjs), the `dist/entry.mjs` stays at ~4-5 MB.

### BaaS Runtime Profile (verified 2026-05-26)

| Property | Value |
|----------|-------|
| Node.js | v20.3.0 |
| Module system | ESM (`file:///user-code/entry.mjs`) |
| Platform | Linux x64, Kubernetes |
| Memory | 900 MB total |
| Temp disk | `/tmp` — writable, persists within pod lifetime |
| Deployed files location | `/user-code/` |
| Web APIs | Response, Request, fetch, ReadableStream, TextEncoder |

## Open Questions (partially answered)

- ~~Does BaaS support ESM or only CommonJS?~~ **ESM confirmed.**
- ~~Does BaaS provide persistent storage or only in-memory?~~ **`/tmp` writable, persists within pod lifetime.** Not persistent across cold starts.
- What are BaaS's actual file size/count limits?
- What's the cold start time budget?
- Can we use Wix data collections from BaaS without additional auth?
