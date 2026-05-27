# Deploying to Wix BaaS

## Prerequisites

- Node.js >= 20
- Wix CLI installed: `npm i -g @wix/cli`
- Wix CLI authenticated: `wix login`
- A Wix site with the app installed
- A Wix data collection named `jay-backend-files` (create in Wix dashboard with fields: `path` text, `content` text, `fileType` text, `sizeBytes` number, `category` text)

## Deployment Flow

### 1. Build the project

```bash
jay-stack build
```

Produces `build/v{n}/frontend/` (static assets) and `build/v{n}/backend/` (server artifacts).

### 2. Initialize Wix project (first time only)

```bash
npm create @wix/new@latest init
```

Creates `wix.config.json` in the project root.

### 3. Configure wix.config.json

Update the generated `wix.config.json` to point at the Jay build output:

```json
{
  "appId": "<your-app-id>",
  "site": {
    "outputDirectory": {
      "client": "./build/v1/frontend",
      "server": "./dist"
    }
  }
}
```

- `client` points at the frontend build directory (static assets → Wix CDN)
- `server` points at `dist/` where `entry.mjs` will be generated

### 4. Upload backend files to Wix data collection

```bash
jay-stack run wix-deploy/upload-backend --collection-id jay-backend-files
```

Uploads server artifacts (manifests, server elements, cache data) to a Wix data collection. Files are categorized as:
- **eager** — manifests, shared server modules, actions (loaded on cold start)
- **lazy** — per-page server elements and cache data (fetched on first request)

Skips images and `.jay-html` files (not used at serve time).

Use `--dry-run` to preview what would be uploaded.

### 5. Build the BaaS entry

```bash
jay-stack run wix-deploy/build-entry \
  --static-base-url https://static.parastorage.com/services/<app-slug>/<version>/ \
  --collection-id jay-backend-files
```

Generates `dist/entry.mjs` (~3-5 MB) — a bundled fetch handler that:
- Pre-imports all plugin init modules and action handlers
- Uses `WixDataArtifactStore` to fetch backend files from the data collection
- Caches fetched files to `/tmp` on the BaaS pod

Use `--exclude-plugins aiditor,ui-kit` to exclude dev-only plugins.

Also generates `dist/serve.mjs` for local testing.

### 6. Test locally (optional)

```bash
node dist/serve.mjs
```

Starts a local HTTP server at `http://localhost:4000` that serves static files from the frontend build directory and delegates page/action requests to `entry.mjs`. Use this to verify the entry works before deploying to BaaS.

Set a custom port with `PORT=3000 node dist/serve.mjs`.

### 7. Deploy via Wix CLI

```bash
# Test deployment (preview environment)
wix app preview

# Production deployment
wix app release
```

The Wix CLI uploads `frontend/` to CDN and `dist/entry.mjs` to BaaS.

## Environment Variables

The BaaS entry reads these from the environment (set via Wix app environment settings):

| Variable | Description |
|----------|-------------|
| `WIX_API_KEY` | API key for accessing the data collection |
| `WIX_SITE_ID` | Site ID for the Wix data collection |
| `STATIC_BASE_URL` | CDN URL prefix for static assets (overrides build-time value) |
| `JAY_COLLECTION_ID` | Data collection name (default: `jay-backend-files`) |

## Updating After Data Changes

When products or CMS content changes, the renderer server updates page files in the data collection. The BaaS serving instance picks up changes on the next request for that page (lazy fetch bypasses disk cache when the data collection version changes).

To redeploy code changes, repeat steps 1, 4, 5, and 6.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ jay-stack   │     │ Wix Data     │     │ Wix CDN      │
│ build       │────→│ Collection   │     │              │
│             │     │ (backend)    │     │ (frontend)   │
└─────────────┘     └──────┬───────┘     └──────┬───────┘
                           │                     │
                    reads on demand        serves static
                           │                     │
                    ┌──────▼───────┐              │
                    │ BaaS Pod     │              │
                    │ entry.mjs    │◄─────────────┘
                    │ /tmp cache   │   (import maps point
                    └──────────────┘    to CDN URLs)
```
