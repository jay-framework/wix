# Design Log #31 — Wix TXT Files and Sitemap Sync

## Background

Jay Framework generates `robots.txt` and `sitemap.xml` as part of the production build (DL#175 in the framework repo). The build pipeline:

- Generates `sitemap.xml` dynamically from the route manifest (`generate-sitemap.ts`), regenerated on rebuild
- Validates that `public/robots.txt` exists
- Serves both as static files from the frontend directory

When deployed to Wix BaaS via `wix-deploy`, Wix Headless intercepts requests to `/robots.txt`, `/sitemap.xml`, `/ads.txt`, and `/llms.txt` **before they reach our handler**. Wix serves its own versions of these files from a platform-level TXT File Server.

This means the framework-generated files are never seen by visitors or search engines — Wix's versions take precedence.

For the sitemap specifically, Wix does **not** consume a `sitemap.xml` from the app. Instead, Wix builds the site's sitemap itself from a page inventory the app exposes at a dedicated route: **`GET /_wix/pages.json`**. The app must serve this contract listing all its pages; Wix reads it to generate `/sitemap.xml`.

## Problem

1. **sitemap not exposed to Wix** (primary) — Wix generates `/sitemap.xml` from the app's `/_wix/pages.json` inventory, but `wix-deploy` doesn't serve that route. So Wix has no knowledge of Jay-rendered pages, and search engines get a sitemap missing most or all actual content pages. The fix is to serve `/_wix/pages.json` from the BaaS entry — see Design.

2. **Custom robots.txt ignored** — When a project provides `public/robots.txt`, it's dropped in favor of Wix's default. Wix's default is reasonable (see below), so this only matters when a project needs custom crawl rules (e.g., disallowing specific paths).

3. **Custom llms.txt ignored** — Same as robots.txt. Wix serves a decent auto-generated `llms.txt`, but a project may want to point AI agents to specific content or the site's MCP endpoint.

4. **ads.txt ignored** — If a project has an `ads.txt` for ad monetization, it's never served (Wix returns 404 when absent).

**Note:** Wix's out-of-the-box `robots.txt` and `llms.txt` are already acceptable (see "Wix Defaults" below). The txt-file sync is therefore an **override-only** feature — needed only when a project supplies its own `public/*.txt`. The sitemap is the one genuine gap.

## Wix TXT File Server APIs

Wix provides REST APIs under `promote-seo-txt-file-server/v2` to manage these files:

| File | Endpoint | Permission |
|------|----------|------------|
| robots.txt | `PUT /promote-seo-txt-file-server/v2/robots` | `SCOPE.PROMOTE.MANAGE-SEO` |
| ads.txt | `PUT /promote-seo-txt-file-server/v2/ads` | `SCOPE.DC-PROMOTE.MANAGE-ADS-TXT` |
| llms.txt | `PUT /promote-seo-txt-file-server/v2/llms` | `SCOPE.PROMOTE.MANAGE-SEO` |

All three share the same shape:

```json
{
  "<type>Txt": {
    "content": "string",
    "default": false,
    "subdomain": "www"
  }
}
```

Setting `default: true` (without `content`) restores Wix's auto-generated content.

## Wix Defaults (from jay-framework.dev)

Retrieved via the TXT File Server GET APIs:

**robots.txt** (`default: true`, `subdomain: "www"`):
```
User-agent: *
Allow: /

# Block PetalBot
User-agent: PetalBot
Disallow: /

# Crawl delay for overly enthusiastic bots
User-agent: dotbot
Crawl-delay: 10
User-agent: AhrefsBot
Crawl-delay: 10

Sitemap: https://www.jay-framework.dev/sitemap.xml

# Auto generated, go to SEO Tools > Robots.txt Editor to change this
```

**llms.txt** — API returns empty `content` with `default: true`, but browsing `https://www.jay-framework.dev/llms.txt` returns a good default (Wix generates it on the fly at request time).

**ads.txt** — API returns empty `content` with `default: true`. Browsing `/ads.txt` returns **404** when not present — which is fine (ads.txt is only relevant to sites running ad monetization).

The Wix default `robots.txt` is reasonable — it allows all crawlers, blocks nuisance bots (PetalBot, dotbot, AhrefsBot), and includes a `Sitemap:` directive pointing to the site's domain. Combined with the on-the-fly `llms.txt` default, this means **Wix's out-of-the-box behavior is already acceptable** for robots.txt and llms.txt. The sync is only needed when a project wants to override with custom content.

## Wix `_wix/pages.json` Contract

Wix reads the app's page inventory from `GET /_wix/pages.json` to build the site sitemap. The full contract (from a reference Astro app) is a flat JSON array:

```json
[
  {
    "path": "/blog/[slug]",
    "srcFilePath": "/src/pages/blog/[slug].astro",
    "static": false,
    "appDefId": "14bcded7-0066-7c35-14d7-466cb3f09103",
    "pageIdentifier": "wix.blog.sub_pages.post",
    "identifiers": { "slug": "BLOG.POST.SLUG" }
  },
  {
    "path": "/blog",
    "srcFilePath": "/src/pages/blog/index.astro",
    "static": true
  },
  {
    "path": "/",
    "srcFilePath": "/src/pages/index.astro",
    "static": true
  }
]
```

### What we emit

We ignore `appDefId`, `pageIdentifier`, and `identifiers` — those are for apps that delegate param resolution to Wix (e.g. Wix Blog resolving `[slug]` from `BLOG.POST.SLUG`). Jay handles all param resolution itself and pre-materializes every concrete page, so:

- Emit **one entry per concrete page** (routes × instances), not per route pattern.
- Set `static: true` for **all** entries — we've already resolved params, so there are no dynamic segments left for Wix to expand.
- `path` — the concrete URL (e.g. `/blog/my-post`, not `/blog/[slug]`), built from `route.pattern` + `instance.params`.
- `srcFilePath` — set equal to `path` (unique per page; see question 1).

This is the **same URL enumeration as the sitemap** (routes × instances → concrete paths), just emitted in Wix's JSON shape instead of sitemap XML.

### Manifest reality (verified against jay-website `route-manifest.json`)

Route entries have `pattern`, `segments`, `serverModule`, `serverElementPath`, and `instances[]` (each with `params`). Notably:

- **No `srcFilePath` field** — must be supplied. Set it equal to the concrete page URL (`path`), which is unique per page (see question 1).
- **No `devOnly` / `noIndex` fields** present in the current build — they're optional in the framework's `RouteEntry` type and simply absent when false. The handler should still check them defensively (`route.devOnly`, `route.noIndex`) so the filter works if/when they appear.
- **Concrete URL** is built by substituting `instance.params` into `pattern` (e.g. `/design-log/jay/[slug]` + `{slug: "00-inspirations"}` → `/design-log/jay/00-inspirations`). Reuse the framework's `buildUrlFromManifest` logic from `generate-sitemap.ts`.

## Questions

1. **`srcFilePath` value**: Wix's example points at the source template (`/src/pages/blog/[slug].astro`). What does Wix use this for on static pages, and what should Jay emit — the source `page.jay-html` path, the built frontend HTML artifact path, or is a placeholder acceptable? (Guess: Wix uses it for de-dup/identity; the route's source path is the safest analog.)

   **Answer**: Assume `srcFilePath` must be unique. For now, set it equal to the concrete page URL (`path`). Since every page has a unique URL, this satisfies uniqueness without deriving a synthetic source path.

2. **When to sync**: Should we sync the txt files on every deploy, or only when the source files have changed? Deploying every time is simpler but makes unnecessary API calls.

   **Answer**: Sync on every deploy. Simpler; the extra API calls are negligible.

3. **llms.txt source**: Should projects author their own `public/llms.txt`, or should we generate one from the route manifest (similar to the pages inventory)?

   **Answer**: Projects author their own `public/llms.txt`. No generation — same treatment as `robots.txt` and `ads.txt`.

## Design

### Deploy-time sync of txt files

During `wix-deploy/deploy`, after the BaaS deployment and backend upload complete, sync the project's txt files to Wix's TXT File Server.

#### Source files

| Wix file | Project source | Fallback |
|----------|---------------|----------|
| robots.txt | `public/robots.txt` | Leave Wix default (already includes bot blocking + sitemap directive) |
| ads.txt | `public/ads.txt` | Leave Wix default (empty) |
| llms.txt | `public/llms.txt` | Leave Wix default (empty) |

Read each file from the project's `public/` directory. If the file exists, `PUT` its content to the corresponding Wix API. If it doesn't exist, leave Wix's default in place — the Wix-generated `robots.txt` is already reasonable (allows all, blocks nuisance bots, references the sitemap), and the user may have configured any of these files via the Wix dashboard.

### `_wix/pages.json` route handler (sitemap)

Unlike the txt files, the pages inventory is served **at request time by the BaaS entry**, not pushed via an API at deploy time. This keeps it in sync with the live route manifest — when a rebuild adds/removes instances, `/_wix/pages.json` reflects the change immediately (same rationale as the framework's dynamic sitemap in DL#175).

#### Handler

Add a route check in the generated entry's `handler()` (in `build-entry.ts`'s `generateEntrySource`), before the normal page match:

```js
if (url.pathname === '/_wix/pages.json') {
    const manifest = await artifacts.readManifest();
    return streamPagesJson(manifest);
}
```

#### Streaming

Page inventories can be large (thousands of pages). Stream the JSON array instead of building it in memory — write `[`, then each entry with comma separators, then `]`, via a `ReadableStream`:

```js
function buildUrl(pattern, params) {
    return (
        pattern
            .replace(/\[\[(\w+)\]\]/g, (_, n) => params[n] || '')
            .replace(/\[\.\.\.(\w+)\]/g, (_, n) => params[n] || '')
            .replace(/\[(\w+)\]/g, (_, n) => params[n] || '')
            .replace(/\/\/+/g, '/')
            .replace(/\/$/, '') || '/'
    );
}

function streamPagesJson(manifest) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(enc.encode('['));
            let first = true;
            const emit = (path) => {
                const entry = { path, srcFilePath: path, static: true };
                controller.enqueue(enc.encode((first ? '' : ',') + JSON.stringify(entry)));
                first = false;
            };
            for (const route of manifest.routes) {
                if (route.devOnly || route.noIndex) continue;
                if (route.instances.length === 0) {
                    const hasDynamic = route.segments.some((s) => s.type !== 'static');
                    if (!hasDynamic) emit(route.pattern === '/' ? '/' : route.pattern);
                    continue;
                }
                for (const instance of route.instances) {
                    emit(buildUrl(route.pattern, instance.params));
                }
            }
            controller.enqueue(enc.encode(']'));
            controller.close();
        },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/json' } });
}
```

This mirrors `generate-sitemap.ts`'s route × instance walk and `devOnly`/`noIndex` filtering — prefer sharing that enumeration helper over duplicating it. Note the entry bundle inlines this handler, so the helper is either copied into the generated source or imported from a small shared module bundled by esbuild.

### Integration point

Add a new step to the `deploy` command in `deploy.ts`, after the parallel BaaS + data upload:

```
1. build-entry (bundle entry.mjs + /_wix/pages.json handler)
2. upload-backend (data collection) ─┐
3. deploy-baas (BaaS + CDN)         ─┤ parallel
4. sync-txt-files                    ─┘ parallel with 2+3, or sequential after
```

The `_wix/pages.json` handler is part of the entry bundle (step 1), so it deploys with the BaaS entry — no separate step needed.

### New module: `sync-txt-files.ts`

```typescript
interface TxtFileSyncResult {
  synced: string[];   // files that were uploaded
  skipped: string[];  // files not found in public/
  errors: string[];   // files that failed to sync
}

async function syncTxtFiles(
  projectRoot: string,
  wixClient: WixClientService,
): Promise<TxtFileSyncResult>
```

For each file type:
1. Check if `public/<filename>` exists
2. If yes, read content and call the Wix API
3. Log result

#### API calls

Use the Wix REST API via the existing `WixClientService` auth:

```
PUT https://www.wixapis.com/promote-seo-txt-file-server/v2/robots
PUT https://www.wixapis.com/promote-seo-txt-file-server/v2/ads
PUT https://www.wixapis.com/promote-seo-txt-file-server/v2/llms
```

## Implementation Plan

### Phase 1: TXT file sync

1. Create `packages/wix-deploy/lib/commands/sync-txt-files.ts`
   - Read `public/robots.txt`, `public/ads.txt`, `public/llms.txt`
   - For each existing file, PUT to the corresponding Wix API
   - Return sync results
2. Wire into `deploy.ts` — call after build-entry, parallel with upload+deploy
3. Add logging: `[deploy]   txt | Synced robots.txt, llms.txt (ads.txt not found)`

### Phase 2: `_wix/pages.json` route (sitemap)

1. Determine `srcFilePath` value (question 1)
2. Add a `/_wix/pages.json` branch to `handler()` in `generateEntrySource` (`build-entry.ts`)
3. Implement `streamPagesJson(manifest)` — stream a JSON array of `{path, srcFilePath, static: true}`
4. Reuse route × instance enumeration + `devOnly`/`noIndex` filtering from the framework's sitemap logic
5. Verify Wix picks up the pages and regenerates `/sitemap.xml`

## Verification Criteria

1. `GET /_wix/pages.json` on the deployed BaaS entry returns a JSON array of all concrete pages, each `static: true`
2. Entries exclude `devOnly` and `noIndex` routes
3. After a rebuild adds/removes instances, `/_wix/pages.json` reflects the change
4. Wix's `/sitemap.xml` includes the Jay-rendered page URLs
5. A project with `public/robots.txt` deploys — `https://<site>/robots.txt` shows the project's content, not Wix's default
6. A project without `public/robots.txt` — Wix's default is left unchanged
7. Same for `ads.txt` and `llms.txt`
8. Deploy logs show which txt files were synced/skipped
9. Auth errors are surfaced clearly (wrong permissions)

## Implementation Results

### `_wix/pages.json` handler (Phase 2) — done

- Added `buildUrl()` + `streamPagesJson()` helpers and a `/_wix/pages.json` route branch to the generated entry source in `build-entry.ts` (`generateEntrySource`). The branch runs after `initialize()` and reads the live manifest via `artifacts.readManifest()`, so it stays in sync with rebuilds.
- Streamed via `ReadableStream`; each entry is `{path, srcFilePath: path, static: true}`.
- **Local verification** against jay-website (`JAY_BACKEND_DIR` filesystem store): `GET /_wix/pages.json` → HTTP 200, `application/json`, **305 pages**, all `static: true`, dynamic routes fully expanded (189 concrete `/design-log/jay/<slug>` pages), **no unresolved `[slug]`** placeholders.
- Regex escaping note: the helpers live inside the `generateEntrySource` template literal, so backslashes are doubled in source (`\\[`) to emit correct regex (`\[`) in the bundle. Verified in the built `dist/entry.mjs`.

### TXT file sync (Phase 1) — done

- Created `packages/wix-deploy/lib/commands/sync-txt-files.ts` — reads `public/{robots,ads,llms}.txt`, `PUT`s each present file to the TXT File Server via `wixClientService.wixClient.fetchWithAuth`. Missing files are skipped (left as Wix default). Returns `{success, synced, skipped, errors}`.
- Wired into `deploy.ts` as a third parallel task alongside `upload-backend` and `deploy-baas`. Non-fatal: txt-sync failures warn but don't fail the deploy. Skipped on `--dry-run`.
- Runs on every deploy (question 2).

### Deviations from design

- `srcFilePath` set to `path` (not a synthetic source path) per question 1 — unique per page, satisfies Wix's uniqueness assumption.
- `sync-txt-files` is invoked internally from `deploy.ts` (`.handler(...)`), not registered as a standalone `.jay-command` — no CLI-facing use was requested.
- Not yet verified end-to-end on a live deploy that Wix's `/sitemap.xml` picks up the pages (criteria 4) — pending a real deploy.

### Live verification (criteria 4) — confirmed

After a real deploy, Wix consumed `/_wix/pages.json` and generated a proper sitemap. `GET /sitemap.xml` returns a Wix-generated sitemap **index**:

```xml
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" generatedBy="WIX">
  <sitemap>
    <loc>https://<site>.wix-site-host.com/pages-sitemap.xml</loc>
    <lastmod>2026-09-02</lastmod>
  </sitemap>
</sitemapindex>
```

...which points at `pages-sitemap.xml` containing the Jay-rendered page URLs:

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" generatedBy="WIX">
  <url><loc>https://<site>.wix-site-host.com</loc><lastmod>2026-09-02</lastmod></url>
  <url><loc>https://<site>.wix-site-host.com/terms-and-conditions</loc>...</url>
  <url><loc>https://<site>.wix-site-host.com/product/hydraglow-moisturizer</loc>...</url>
  <url><loc>https://<site>.wix-site-host.com/products/body-products</loc>...</url>
  <!-- ...all Jay pages from /_wix/pages.json -->
</urlset>
```

Wix wraps our page inventory in its own sitemap index + `pages-sitemap.xml`, adds `<lastmod>`, and serves it at `/sitemap.xml` — exactly the desired outcome. All criteria met.
