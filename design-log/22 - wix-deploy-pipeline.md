# Design Log 22: Wix Deploy Pipeline

## Status

Draft

## Background

DL#20 and DL#21 established the technical architecture for deploying Jay Framework apps to Wix BaaS. The deployment works end-to-end (validated on `store-light`), but the developer experience is fragmented: four manual steps, two credential files, three different tools, and no site creation story.

### Current Deployment Sequence

```
Step 1: npm run build:production
  └─ jay-stack-cli build
  └─ Produces: build/v1/frontend/ (CDN assets) + build/v1/backend/ (server artifacts)

Step 2: npm run deploy:upload-backend
  └─ jay-stack-cli run wix-deploy/upload-backend
  └─ Uploads: cache.json, page-parts.json, route-manifest.json → Wix Data Collection
  └─ Credentials: config/.wix.yaml (API key + site ID for Wix SDK)

Step 3: npm run deploy:build-entry
  └─ jay-stack-cli run wix-deploy/build-entry
  └─ Bundles: entry.mjs (2.5 MB) with plugins, server elements, framework → dist/
  └─ Also generates: serve.mjs (local testing), config/.wix.yaml copy

Step 4: npm run deploy:deploy
  └─ jay-stack-cli run wix-deploy/deploy-baas
  └─ Uploads: dist/entry.mjs → BaaS, build/v1/frontend/ → Wix CDN
  └─ Credentials: wix.config.json (Wix CLI auth — separate from .wix.yaml)
```

### What Goes Where

| Target              | Content                                         | Uploaded By        | Credentials      |
| ------------------- | ----------------------------------------------- | ------------------ | ----------------- |
| Wix BaaS            | `entry.mjs` (2.5 MB bundled server code)        | Wix CLI (step 4)   | `wix.config.json` |
| Wix CDN             | Frontend JS/CSS bundles                          | Wix CLI (step 4)   | `wix.config.json` |
| Wix Data Collection | cache.json, page-parts.json, manifest            | Wix SDK (step 2)   | `config/.wix.yaml` |
| (bundled in entry)  | Server elements, plugins, ssr-runtime            | esbuild (step 3)   | n/a               |

## Problem

### P1: Too Many Steps

Four manual steps to deploy. Steps 2 and 3 are independent and could run in parallel. Steps 1→3→4 are sequential. A developer must remember the correct order.

### P2: Two Credential Systems

- `config/.wix.yaml` — Used by `@jay-framework/wix-server-client` for Wix SDK access (API key + site ID). Read at build time and at BaaS runtime. Copied into `dist/config/` for BaaS.
- `wix.config.json` — Used by the Wix CLI for deployment auth. Contains app ID and site reference. Read by `wix preview`/`wix release`.

These serve different purposes (SDK access vs deployment), but having two config files is confusing. Can they be unified? Or at least derived from one source?

### P3: Setup Sequence

`npm create @wix/new init` creates a new Wix headless site and outputs `wix.config.json`. But there are several additional manual steps before deployment works:

1. **Add Wix applications** — e.g., Wix Stores, Wix Data — done from the Wix Business Manager UI. Required for the site to have the APIs the app depends on.
2. **Create the data collection** — the `jay-backend-files` collection used to store deployment JSON files (cache.json, page-parts.json, manifest). Done manually via the Wix dashboard or API.
3. **Create API key and client ID** — needed for `config/.wix.yaml` so the Wix SDK can access data collections and APIs at runtime (both during `upload-backend` and on BaaS). Done via Wix dashboard → API Keys.
4. **Configure `config/.wix.yaml`** — manually enter the API key, client ID, and site ID.

Steps 1-4 are all done before the first deploy and are currently undocumented — the developer needs to know the Wix platform to complete them. Some could potentially be automated (e.g., creating the data collection via API, generating the API key).

### P3.1: Setup Validation

The framework has a setup lifecycle (`_serverSetup`) that plugins can use to validate their prerequisites at dev/build time:

- **wix-server-client** already validates credentials — checks that API key and site ID are configured and can authenticate.
- **wix-stores / wix-stores-v1** could validate that the Wix Stores application is installed on the site and is the expected version. Currently they don't — if Stores isn't installed, you get opaque API errors at runtime.
- **wix-deploy** could validate that the data collection exists and is accessible.

Adding setup validation to each plugin would catch misconfiguration early (at `jay-stack dev` / `jay-stack build` time) instead of at deploy or runtime.

### P4: serve.mjs Confusion

`build-entry` generates `serve.mjs` alongside `entry.mjs` in `dist/`. The Wix CLI uploads everything in the server output directory. If BaaS picks up `serve.mjs` instead of `entry.mjs`, it sets `JAY_BACKEND_DIR` to a local Mac path, causing the `WixDataArtifactStore` to be bypassed.

## Questions & Answers

Q1: Can we combine steps 2, 3, and 4 into a single `deploy` command?
A: Yes. Step 4 (`deploy-baas`) is already multi-step internally (bundles entry, uploads to BaaS, uploads frontend to CDN). All of steps 2-4 should be a single `deploy` command.

Q2: Can `config/.wix.yaml` and `wix.config.json` be unified?
A: Partially. `wix.config.json` has `appId` which equals `clientId` in `.wix.yaml`, and the site ID can be derived from it too. The only field that can't be derived is the API key — that requires manual creation in the Wix dashboard. So `.wix.yaml` generation only needs one manual input (the API key).

Q3: `npm create @wix/new init` creates the site + `wix.config.json`. Can we derive `config/.wix.yaml` from it?
A: Mostly — site ID and client ID (`appId`) can both be derived from `wix.config.json`. Only the API key requires manual creation in the Wix dashboard. The setup command needs just one manual input.

Q4: Should `serve.mjs` be generated outside `dist/` to avoid accidental upload?
A: Yes. Generate it in the project root instead of `dist/`.

Q5: What's the minimal deploy experience we're targeting?
A: Two commands for day-to-day work, plus a one-time setup:

```bash
# One-time setup (after npm create @wix/new init)
jay-stack-cli run wix-deploy/setup    # guides through: create data collection, API key, .wix.yaml

# Day-to-day
yarn build                            # jay-stack-cli build
yarn deploy                           # jay-stack-cli run wix-deploy/deploy
```

## Design

### Target Command Structure

```
jay-stack-cli setup  — Runs all plugins' setup hooks, including wix-deploy's
wix-deploy/deploy    — Build + upload + deploy (replaces steps 2-4)
wix-deploy/serve     — Generate serve.mjs for local testing
```

The framework already has a setup lifecycle (`_serverSetup` hook). The wix-deploy plugin registers its setup logic there — no separate CLI command needed. Running `jay-stack-cli setup` (or the first `jay-stack-cli dev`) triggers all plugins' setup hooks in order: `wix-server-client` validates credentials, then `wix-deploy` creates the data collection, etc.

### Deploy Command Internal Flow

```
jay-stack-cli run wix-deploy/deploy
  │
  ├─ 1. Read build/v1/backend/build-metadata.json
  │     └─ Validate build exists, read current version N
  │
  ├─ 2. Increment version to N+1
  │     └─ Ensures running version N is not disturbed mid-deploy
  │
  ├─ 3. Bundle entry.mjs with version N+1 baked in
  │
  ├─ 4. Parallel:
  │     ├─ Upload backend data files → Wix Data Collection (version N+1)
  │     └─ Deploy dist/entry.mjs → BaaS + build/v1/frontend/ → CDN (via Wix CLI)
  │
  └─ 5. Done — BaaS cold-starts load version N+1 from data collection
```

Step 4 parallelizes the two upload targets: the data collection (cache.json, page-parts.json, manifest) and BaaS+CDN (entry.mjs, frontend assets). Both use version N+1. The running version N continues serving from the data collection until BaaS cold-starts pick up the new entry.mjs with version N+1.

### Versioning

The deploy command owns version incrementing. Currently `build-metadata.json` has a `version` field (default 1). The deploy command:

1. Reads current version N from `build-metadata.json`
2. Uploads data collection items keyed as `v{N+1}__*`
3. Bakes `N+1` into entry.mjs (`VERSION` constant)
4. Deploys entry.mjs — new BaaS instances read version N+1 from the data collection

This means:
- Running instances serve version N until they cold-start with the new entry.mjs
- Data collection has both version N and N+1 items — no disruption
- `build` always produces version 1; `deploy` increments on each deploy

Q: Should the version be stored in `build-metadata.json` (updated by deploy) or tracked separately (e.g., in the data collection itself, or in a deploy-state file)?

### Setup Flow (via framework setup hook)

```
jay-stack-cli setup  (triggers _serverSetup on all plugins)
  │
  │  wix-server-client setup (runs first):
  ├─ 1. Create config/.wix.yaml with placeholders if missing
  ├─ 2. Validate API key is configured (not placeholder)
  │     └─ If missing: log instructions to create one at https://manage.wix.com/...
  │
  │  wix-deploy setup (runs after wix-server-client):
  ├─ 3. Validate wix.config.json exists
  │     └─ If missing: log instructions to run npm create @wix/new init
  ├─ 4. Validate: authenticate with Wix SDK
  └─ 5. Create data collection "jay-backend-files" via Wix SDK
        (if not already exists)
```

### serve.mjs

Separate command (`wix-deploy/serve`) rather than a side-effect of deploy. Generates `serve.mjs` in the project root (not `dist/`) to avoid BaaS uploading it.

Supports two modes:
- **Local files** (default): `JAY_BACKEND_DIR` points at `build/v1/backend/`, uses `FilesystemArtifactStore`
- **Wix data**: no `JAY_BACKEND_DIR`, uses `WixDataArtifactStore` — tests the full BaaS code path locally

## Implementation Plan

### Phase 1: Quick Wins
- Move `serve.mjs` generation to project root
- Combine steps 2-4 into a single `wix-deploy/deploy` command

### Phase 2: Setup Command
- Create `wix-deploy/setup` command
- Auto-create data collection
- Guide API key creation
- Generate `.wix.yaml`

### Phase 3: Validation
- `wix-stores` setup lifecycle: validate Stores app is installed
- `wix-deploy` setup lifecycle: validate data collection exists
