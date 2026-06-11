# Deploying to Wix BaaS

## Overview

The `wix-deploy` plugin deploys Jay Framework apps to Wix BaaS (serverless). It bundles the server code into a single `entry.mjs`, uploads page data to a Wix data collection, and deploys to BaaS + CDN.

```bash
npm run build:production     # build frontend + backend
npm run deploy               # bundle + upload + deploy
```

## Setup (First Time)

### 1. Create the Wix headless site

```bash
npm create @wix/new@latest init
```

Creates `wix.config.json` with `appId` and `siteId`. This is the **deployment target** — the BaaS worker and CDN assets go here.

### 2. Add Wix applications

In the Wix Business Manager, add the applications your project needs (e.g., Wix Stores, Wix Data). This is done on the **backend services site** — which may be the same site as the deployment target, or a different one in a headless setup.

### 3. Create an API key

In the Wix dashboard (API Keys section), create an API key with permissions for:
- Wix Data (read/write) — for the backend files data collection
- Any APIs your app uses (Stores, CMS, etc.)

### 4. Configure credentials

Add the API key to `config/.wix.yaml`. Running `jay-stack-cli setup` will fill in `clientId` and `siteId` from `wix.config.json` automatically — you only need to add the API key.

```yaml
apiKeyStrategy:
  apiKey: <your-api-key>
  siteId: <auto-filled-from-wix-config>
oauthStrategy:
  clientId: <auto-filled-from-wix-config>
```

### 5. Authenticate with Wix CLI

```bash
wix login
```

Stores OAuth tokens in `~/.wix/auth/`. The deploy command refreshes expired tokens automatically.

### 6. Create the data collection

Create a collection named `jay-backend-files` in the Wix dashboard (on the business site, where `.wix.yaml` points). Required fields:

| Field | Type | Description |
|-------|------|-------------|
| `path` | Text | Relative file path |
| `content` | Text | File content |
| `fileType` | Text | File extension |
| `sizeBytes` | Number | Content byte length |
| `category` | Text | `eager` or `lazy` |
| `version` | Text | Build version (semver) |

### 7. Validate setup

```bash
jay-stack-cli setup
```

Should show all three plugins as configured:
- `wix-server-client` — credentials verified
- `wix-deploy` — deploy target confirmed
- `wix-stores` — Stores API connected

## Two Credential Files

The two config files serve different purposes and can point to different Wix sites:

| File | Purpose | Used At | Key Fields |
|------|---------|---------|------------|
| `config/.wix.yaml` | Backend services — Wix SDK, data collections, Stores API | Build time + BaaS runtime | `apiKey`, `clientId`, `siteId` |
| `wix.config.json` | Deployment target — BaaS hosting + CDN | Deploy time only | `appId`, `siteId` |

**Headless architecture:** Deploy the BaaS worker to one site (the "app" site via `wix.config.json`) while accessing products, orders, and content on a different site (the "business" site via `.wix.yaml`).

**Simple setup:** Both files point to the same site. The `clientId` in `.wix.yaml` equals `appId` in `wix.config.json`.

## Deploy Command

### `wix-deploy/deploy` (recommended)

```bash
jay-stack-cli run wix-deploy/deploy --exclude-plugins aiditor
```

Internally:
1. **Bundle** `entry.mjs` (~2.5 MB) — plugins, server elements, framework code
2. **Parallel:**
   - Upload backend data files → Wix data collection
   - Deploy entry.mjs → BaaS + frontend assets → CDN

Options:
- `--exclude-plugins <names>` — comma-separated plugins to exclude from the bundle
- `--collection-id <name>` — data collection name (default: `jay-backend-files`)
- `--static-base-url <url>` — CDN URL prefix for static assets
- `--dry-run` — preview without uploading

### Individual commands (for debugging)

```bash
jay-stack-cli run wix-deploy/build-entry       # bundle entry.mjs only
jay-stack-cli run wix-deploy/upload-backend     # upload data files only
jay-stack-cli run wix-deploy/deploy-baas        # deploy to BaaS + CDN only
```

## Local Testing

```bash
node serve.mjs
```

Starts a local server at `http://localhost:4000`. Uses the local build directory for backend files (no data collection access needed).

## What Gets Deployed Where

```
┌─────────────────────────────────────────────────────────┐
│ entry.mjs (2.5 MB) → Wix BaaS                          │
│                                                         │
│ Bundled by esbuild:                                     │
│  ├── Framework serve code                               │
│  ├── Plugin code (wix-stores, wix-cart, etc.)           │
│  ├── Server element modules (SSR render functions)      │
│  ├── ssr-runtime (inlined)                              │
│  ├── Wix SDK (@wix/sdk, @wix/stores, etc.)             │
│  ├── WixDataArtifactStore (data collection client)      │
│  └── MODULE_REGISTRY (pre-imported module lookups)      │
│                                                         │
│ No node_modules on disk. No dynamic import() at runtime.│
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Wix Data Collection (jay-backend-files)                  │
│                                                         │
│ Eager (loaded on cold start):                           │
│  ├── route-manifest.json                                │
│  └── build-metadata.json                                │
│                                                         │
│ Lazy (fetched per-route, cached in /tmp):               │
│  ├── page-parts.json (per route)                        │
│  └── *.cache.json (per page instance)                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Wix CDN                                                  │
│                                                         │
│  ├── shared/*.js (framework client runtime)             │
│  ├── pages/**/*.js (route client bundles + hydrate)     │
│  └── pages/**/*.css (route stylesheets)                 │
└─────────────────────────────────────────────────────────┘
```

## Updating After Data Changes

When products or CMS content changes, the renderer server updates page files in the data collection. The BaaS instance picks up changes on the next request for that page (cache miss triggers a fresh fetch).

To redeploy code changes: `npm run build:production && npm run deploy`.
