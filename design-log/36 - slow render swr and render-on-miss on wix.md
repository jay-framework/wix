# Design Log 36: Slow-Render SWR + Render-on-Miss on Wix

## Status

Implemented (store) · Decided (plugin TTL/grace defaults)

**Companion to the jay-framework repo's** [DL#226 — Stale-While-Revalidate Slow Render in Production](https://github.com/jay-framework/jay/blob/main/design-log/226%20-%20stale-while-revalidate%20slow%20render%20in%20production.md)
**and** [DL#227 — New Items in Production: Render-on-Miss + Instance Index](https://github.com/jay-framework/jay/blob/main/design-log/227%20-%20new%20items%20in%20production%20-%20render%20on%20miss%20and%20instance%20index.md).
This DL tracks, on the Wix side, the work those two designs required here.

## Background

Wix BaaS deploys (DL#20/#22) run the Jay production server **without a renderer role** and **without
usable disk** — the main server reads `{slowViewState, carryForward}` from `WixDataArtifactStore`
(`packages/wix-deploy/lib/artifact-store.ts`): eager files cached at cold start, lazy files
(`page-parts.json`, `*.cache.json`) fetched from the `jay-backend-files` Wix Data collection and
cached in `/tmp`.

Before DL#226/#227 this had two gaps on Wix specifically:

1. **Slow data never refreshed** short of a redeploy, and the `/tmp` cache never expired — so even if
   the shared DB changed, running instances never saw it.
2. **New items 404'd** until a rebuild, because the instance list was a build-time snapshot that could
   not be updated across running BaaS instances without a shared mutable structure (CAS, revisions…).

DL#226 (SWR) and DL#227 (render-on-miss + per-instance index) solve both in the framework; this DL
records what that meant for the Wix packages.

## What landed in the Wix repo (Implemented)

`WixDataArtifactStore` implements the extended `ArtifactStore` interface from DL#226/#227
(`packages/wix-deploy/lib/artifact-store.ts`):

- `getInstance(route, params)` — resolve by the deterministic `deriveCachePath(route, params)`
  (artifact-store.ts:222).
- `listInstances(route)` — enumerate a route's instances for sitemap / `pages.json` / llms.txt
  (artifact-store.ts:237); consumed by `build-entry.ts:327`.
- `writeCacheData(route, params, entry)` — the single upsert for SWR refresh **and** render-on-miss
  (artifact-store.ts:254).
- `removeInstance(route, params)` — delete data + index membership (artifact-store.ts:293).

**The per-instance DB item is its own index entry.** Each `*.cache.json` item carries
`category: 'instance'`, `route`, and `params` (artifact-store.ts:24, :268), so creating an instance
is one idempotent insert at the derived `_id` and deleting is one delete — **no shared mutable
manifest, no CAS, no revisions, no manifest TTL/size limit.** `upload-backend` writes those index
fields on instance items (upload-backend.ts:149). Instances therefore leave `route-manifest.json`
(routes-only), exactly per DL#227.

Result on Wix:

- **SWR (DL#226):** a stale page is served immediately with `Cache-Control: no-store` and refreshed
  in the background through `writeCacheData` into the shared Wix Data collection (then `/tmp`); an
  expired page waits briefly for the refresh (`JAY_STALE_WAIT_MS`). Refreshing re-checks the shared
  copy first, so replicas don't each re-render.
- **Render-on-miss (DL#227):** a request for a route that matches but whose instance isn't in the DB
  triggers one slow render; a real `ClientError 404` → 404 + in-memory negative cache (10 min); no
  free render slot → `503 Retry-After`. New products/posts go live without a redeploy.

## Framework fixes that affect Wix serving (tracked here)

Two jay-side bugs — fixed in `@jay-framework/production-build` / `@jay-framework/production-server`
(jay DL#227 "Bug + fix (1)/(2)") — manifest specifically on Wix because Wix serving leans on
render-on-miss and SWR refresh:

1. **Static-override instance key.** A static page that shadows a dynamic route and carries its param
   inline (e.g. a hand-authored `products/<slug>/page.jay-html` next to `products/[slug]/`) was built
   under `page_<hash(params)>.cache.json` but served with `{}` → cache miss → instance-less
   render-on-miss. Fixed by keying the build cache by the **URL-visible** params (→ `page.cache.json`
   for a static override), so build and serve agree.
2. **Refresh / render-on-miss dropped headless instances.** The serve-side slow re-render loaded
   `discoveredInstances: []` (never persisted), so a refreshed or missed page re-rendered **without**
   its shared headless instances (e.g. `site-header`, `cart-indicator`) — the client then logged
   "Headless instance … has no server data" and crashed. Fixed by persisting `discoveredInstances` in
   `page-parts.json` and loading it at serve.

**Operational note:** picking these up on Wix requires syncing the fixed
`@jay-framework/production-build` **and** `@jay-framework/production-server` into the deploy
(`sync-jay-packages.cjs`) **and rebuilding** the site (the fix adds a `discoveredInstances` field to
`page-parts.json`, so a pre-fix build must be regenerated).

## Decision — default TTL/grace for all Wix plugins

To make SWR actually run on Wix BaaS (where no renderer role or webhook may exist), **every Wix
plugin's slow render sets a freshness contract by default:**

- **`ttl = 600` seconds (10 minutes)** — after 10 min a cached page is `stale`.
- **`grace = 3600` seconds (60 minutes)** — up to 60 min, serve the stale copy immediately and refresh
  in the background; past 60 min the page is `expired` and the next request waits briefly for a fresh
  render.

Rationale: 10 min keeps store/catalog/content reasonably current without hammering Wix Data on every
request; the 60 min grace window means visitors almost never block on a render (only the first request
after a full hour, or a cold item), while the shared-DB refresh keeps replicas consistent. Values are
in seconds and are combined per DL#226 rule 2 (min positive `ttl`, min positive `grace` across a
page's parts; `ttl` floored at 10 s).

This applies to the slow phase of the Wix plugin components (wix-stores product-page, category-products,
product-search, product-spotlight, category-list; wix-stores-v1 equivalents; wix-cart cart-page;
wix-data collection list/table/card/item; wix-forms; wix-bookings) — 16 slow-render components in all.

**Status:** decided here; the per-component `phaseOutput(..., { ttl: 600, grace: 3600 })` edits are a
follow-up (not applied in this DL).

## Verification

1. A Wix-deployed page goes `stale` after 10 min and serves-stale-then-refreshes (check
   `jay-freshness: stale, <age>ms` and a background `writeCacheData`), and `expired` after 60 min.
2. A new product/post URL (route matches, no DB instance) renders on first request (render-on-miss),
   and a genuine 404 is negative-cached.
3. A static override page and any refreshed/missed page carry their shared headless instances
   (site-header / cart-indicator) — no "no server data" console error (requires the synced, fixed
   production-build/production-server + a rebuild).

## Trade-offs

- A fixed 10 min / 60 min default is coarse; per-plugin or per-page tuning can come later (the
  contract is already per-instance, min-combined). The default favors "never block a visitor" over
  "always perfectly fresh".
- SWR + render-on-miss add Wix Data reads/writes on refresh/miss; the `/tmp` cache + shared-copy
  re-check keep that bounded.
