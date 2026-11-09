# 38 - Dashboard URLs for Plugin Content

**Status:** [Implemented] — Phases A–C done; final QA recorded 2026-11-03; several course corrections **2026-11-04** (cart/members guides removed, Pro Gallery headless, wix-data contract pointers — see DL #39).

**Read first:** [Authoritative summary (2026-11-04)](#authoritative-summary-2026-11-04) — current product and code. The [original TL;DR](#decisions-for-the-implementer-tldr--original-design) and parts of [Design](#design) are historical where they conflict with that summary or [Implementation Results → Final status](#final-status-and-decisions-2026-11-03).

## Authoritative summary (2026-11-04)

What implementers and agents should treat as true today:

1. **Bound plugin data (not props/markup).** Values from a contract's ViewState (product name, CMS field, form field stored in Wix, booking service name, gallery slide content on headless, etc.) are **not** fixed by hard-coding jay-html or replacing bindings — including "just this page" (QA cases 03, 05). **Props** (`galleryId`, `autoplay`, `formId` on the component, layout/CSS) stay normal jay-html edits (original TL;DR #8).
2. **Writes at the source are allowed** when the agent is confident it has the right record id from the guide's lookup steps and a working Wix API or tool; say plainly what changed. If not confident, ambiguous, or no tool → **do not write**; give a dashboard link when `getDashboardUrl` applies.
3. **Dashboard links only via `getDashboardUrl`.** One devOnly action on `@jay-framework/wix-server-client`: `getDashboardUrl({ path }) → { url }`. Never build URLs from credential files; guides document `npx jay-stack-cli action wix-server-client/getDashboardUrl --input '{"path":"…"}'`.
4. **Static contracts:** `editingGuide` or `readonly: true` on each entry in the plugin's `plugin.yaml`; one shared **`agent-kit/designer/<plugin>-dashboard-content.md`** per plugin (mechanical inspector lookup + fallbacks inlined there).
5. **Dynamic / generated contracts (no `plugin.yaml` entry):** the **materialized `.jay-contract`** names the guide — see **wix DL #39**. **wix-stores** `product-page`: `editingGuide: agent-kit/designer/wix-stores-dashboard-content.md`. **wix-data** (item/list/table/card): top-level **`collectionId`** (authoritative; never from contract name) + **`editingGuide: agent-kit/references/wix-data/wix-data-dashboard-content.md`** (single shared CMS procedure copied on `jay-stack agent-kit` — **no** per-contract stub files under `editing-guides/`).
6. **Cart and members:** **`readonly: true` only** — no `editingGuide`, no session-state designer guides (removed 2026-11-04). Reply: session state, not site content; edit template if they meant look.
7. **Pro Gallery on Jay headless:** slide **content** is not dashboard-managed in practice (no Pro Gallery dashboard app, no Editor on headless). Guide: Pro Gallery API when the agent has access; do **not** default to dashboard `home` or Editor for slide photos/titles. Autoplay/`galleryId`/layout remain props/template.
8. **AIditor follow-up (jay):** surface each selection's `editingGuide` / `readonly` in the worker prompt so guides are not optional reading (DL #64 / finding 2).

Cross-refs: **wix DL #39** (wix-data materialized headers); **wix DL #64** (thread replies, contract guide injection).

## Decisions for the Implementer (TL;DR) — original design

> **Partially superseded** by [Authoritative summary](#authoritative-summary-2026-11-04) and [Final status (2026-11-03)](#final-status-and-decisions-2026-11-03). Items below reflect the **first** written design; strikethrough notes mark what changed after QA and product review.

1. **Behavior.** ~~When asked to change content bound to a Wix plugin contract, the agent edits **no code and no data**.~~ **Superseded:** do not edit **code** for bound data; **may update data at its source** when the guide's id steps and tools allow; otherwise dashboard link + plain reply (Final status #1–2).
2. **One action, not one per plugin.** Add a single devOnly action `getDashboardUrl` to `@jay-framework/wix-server-client`:
   `getDashboardUrl({ path: string }) → { url: string }` returning `https://manage.wix.com/dashboard/<siteId>/<path>`. No per-plugin URL actions.
3. **Route templates live in guides.** Each contract's `editingGuide` file holds its route template(s) and says which inspector identity fills each placeholder. Contracts with no editable record are `readonly: true`.
4. **siteId source, in order.** (a) call the exported `loadConfig()`; if it throws (no `config/.wix.yaml`, missing `oauthStrategy`, …) treat as absent; if `auth.kind !== 'apiKey'` (`visitor` or `app`, neither carries a siteId) treat as absent; else use `auth.apiKey.siteId`. (b) non-empty `siteId` in `wix.config.json`. (c) neither → throw `"Ask the site owner to configure the Wix site."`
5. **Stores product page** has only the `slug` route param → the guide tells the agent to call the existing public `getProductBySlug` action to get `_id`. No new action.
6. **`dynamic_contracts` can't carry `editingGuide` in jay's schema** (wix-stores `product-page`, wix-data). **Interim was** agent-kit designer sections only. **Now:** generated `.jay-contract` YAML carries `editingGuide` (+ `collectionId` for wix-data) per **wix DL #39**; jay manifest follow-ups remain optional.
7. ~~**No writes.** We don't add write actions, media upload, or anything else that copies the dashboard.~~ **Superseded (2026-11-03):** no new **devOnly write actions** in this log; agents **may** use existing Wix APIs/tools when the guide allows and ids are known.
8. **Data vs markup.** TL;DR #1 covers **bound data** only (values from a plugin's ViewState). A component's **props** (e.g. pro-gallery `galleryId`, `autoplay`, `intervalMs`, `loop`; wix-forms `formId`) and the template's markup/CSS live in jay-html and are edited normally. Each guide says which requests are props/markup and which are dashboard data.
9. **Pro Gallery links to the gallery, never to Media Manager.** **Superseded for headless slide content (2026-11-04):** no reliable gallery dashboard route on headless; see [Authoritative summary #7](#authoritative-summary-2026-11-04). Media Manager was never correct for "change this slide."
10. **Verify routes before writing guides.** Phase A (below) must prove API-key siteId == dashboard metaSiteId and settle every "assumed"/"unknown" table row before any guide is written.

## Background

`@jay-framework/jay-stack` source editing lets a `plugin.yaml` contract declare `editingGuide: <file>` (how an agent should change this content) or `readonly: true`. The inspector gives the agent an identity for the selected element: the forEach `trackBy` value (`itemId`), a component's static `props`, or route params. `jay-stack validate-plugin` emits a `source-editing-coverage` warning for static contracts that declare neither field.

devOnly actions (`actions[]: {name, devOnly: true}`, handler exported from the plugin's `./tools` entry) can be called at `/_jay/actions/<plugin>.<action>` or with `jay-stack action <plugin>/<action> --input '<json>'`, and are left out of production builds. Prior art in this repo: `wix-media/plugin.yaml:15-24`.

Wix documents dashboard deep links ("Dashboard Navigation" skill, `routes.json`): base `https://manage.wix.com/dashboard/{metaSiteId}/{route}`. Unknown deeper paths fall back to the longest matching route (no 404). `{metaSiteId}` is the `siteId` in a CLI project's `wix.config.json`.

## Problem

Content on a Jay+Wix page often comes from Wix data (products, CMS items, forms, services, galleries). If the agent is asked to edit it, it may hard-code new text into jay-html or try to write to Wix. Both are wrong: the dashboard owns this data. No wix contract declares `editingGuide` or `readonly` today, so the agent gets no guidance.

## Prior Art / Adjacent Mechanisms

- `editingGuide` / `readonly` in `plugin.yaml` (jay public surface): the hook we fill in.
- `loadConfig()` in `@jay-framework/wix-server-client` (`lib/config-loader.ts:72`; `ApiKeyConfig` at `:5-8`) parses `apiKeyStrategy.siteId`. It throws when `config/.wix.yaml` is missing or has no `oauthStrategy`, returns `kind: 'visitor'` when there is no key/app strategy, and `appStrategy` has no siteId.
- `wix.config.json` `siteId` is read by the private `readWixConfig()` in `wix-server-client/lib/setup.ts:101`. The action **reuses** it (extract to a small shared module in the same package); no second parser.
- Action build pattern: `wix-data` (`lib/actions/*.jay-action`, `definitions` + `build:copy-actions` scripts, `./<name>.jay-action` entries in `package.json` `exports`). `wix-server-client` has none of these yet.
- CMS collection ids: each wix-data entry in the materialized `agent-kit/plugins-index.yaml` carries `metadata.collectionId` (e.g. `Recipes`, `Food_Service--Product_lines`); `agent-kit/references/wix-data/collections.yaml` is the full catalog.
- devOnly actions: `wix-media` (`plugin.yaml:15-24`, `lib/tools.ts`).
- Existing public `getProductBySlug` in wix-stores and wix-stores-v1.
- An earlier approach with write actions and media upload was rejected as too complex.

## Q&A

**Q: Could guides alone be enough, with the agent reading siteId from `config/.wix.yaml`?**
No. That file holds the **API key**. Telling the agent to read it puts a secret in the agent's context and transcript. The action reads the file server-side and returns only the URL. `wix.config.json` has no secret, but API-key projects may not have it, so we still need one place that knows both sources.

**Q: Why not one URL action per plugin?**
Every URL is "base + siteId + path". Only the path differs, and the path is static text plus an id the agent already has. One action + templates in guides is the smallest surface. A plugin would need its own action only if building the path needed a lookup no public action covers. Today only stores product-page needs a lookup, and `getProductBySlug` covers it.

**Q: Why `wix-server-client`?**
It owns the config and every Wix plugin already depends on it. It has no `actions` yet. It already has `lib/tools.ts` (exports `setupWixServerClient`) and a `./tools` export in `package.json`; put the handler in `lib/actions/get-dashboard-url.ts` and re-export it from the existing `lib/tools.ts` (Phase A step 1).

**Q: Product page — use the bound `_id` tag or `getProductBySlug`?**
`_id` is a data tag (`product-page.jay-contract:8`), but the inspector identity for a route page is the `slug` param, and `_id` is usually not rendered. The guide says: "if you have `_id`, use it; otherwise call `getProductBySlug({ slug })`".

**Q: Pro Gallery — why not link to Media Manager when no gallery route is known?**
Media Manager is the file library. A gallery is a structured entity: item order plus per-item `title`, `description`, `altText`, `link`, `mediaId` (`pro-gallery.jay-contract`, `items` sub-contract). "Change this slide" means changing a gallery item, which is done in the Pro Gallery editor (which itself picks files from Media Manager). Sending the user to Media Manager is the wrong screen. An honest `home` link that names the gallery is better than a confident wrong one.

**Q: Why not add Pro Gallery writes, like stores' product-image writes?**
Stores writes came from a separate, committed product effort on product images. Gallery writes would be a new action surface (gallery id + item id + media upload + ordering) — exactly what TL;DR #7 rules out. If product wants "replace this slide from an attachment", that is a separate design log (Open Questions).

**Q: API-key `wix-site-id` == dashboard `metaSiteId`?**
Believed yes; **verify live** (Verification Criteria #1).

## Design

### Action

```yaml
# packages/wix-server-client/plugin.yaml
actions:
  - name: getDashboardUrl
    action: get-dashboard-url.jay-action
    devOnly: true
```

```yaml
# packages/wix-server-client/lib/actions/get-dashboard-url.jay-action
name: getDashboardUrl
description: Dev-only. Build the Wix dashboard URL for a dashboard path (site id read server-side).
inputSchema:
  path: string
outputSchema:
  url: string
```

- Input `{ path: string }`; strip leading `/`s, then require `^[A-Za-z0-9/_.-]+$` and reject any `..` segment. This rejects empty paths, schemes (`:`), queries/fragments, and traversal; real routes and ids (GUIDs, slugs) fit the charset.
- Throw the TL;DR #4 error when no siteId is configured.
- The `.jay-action` file is required: plugins-index skips actions without one (devOnly is not filtered there), and the index is how agents discover the action.

### Guide shape (per contract, ~10 lines)

```md
Content here is managed in the Wix dashboard. Do not edit code or data.

1. Product id = inspector `itemId` (trackBy `_id`).
2. Call `wix-server-client/getDashboardUrl` with path `wix-stores/products/product/{productId}`.
3. Reply: "This is managed in the Wix dashboard: <url>".
   No id → path `wix-stores/products`.
```

### Contract table

| Plugin / contract                                          | Identity                                                                                                                                                                                             | Route (path)                                                                                                     | Source                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| wix-stores product-search, category-products               | itemId (`_id`)                                                                                                                                                                                       | `wix-stores/products/product/{productId}`                                                                        | docs                                             |
| wix-stores product-spotlight                               | prop `slug` → `getProductBySlug`                                                                                                                                                                     | `wix-stores/products/product/{productId}`                                                                        | docs                                             |
| wix-stores category-list                                   | itemId (`_id`)                                                                                                                                                                                       | `wix-stores/categories/list` (no category deep link)                                                             | docs                                             |
| wix-stores product-page (dynamic)                          | param `slug` / `_id`                                                                                                                                                                                 | `wix-stores/products/product/{productId}`                                                                        | docs                                             |
| wix-stores-v1 product-page, product-search                 | `_id` / slug                                                                                                                                                                                         | `wix-stores/products/product/{productId}`                                                                        | assumed for v1 catalog — verify                  |
| wix-stores-v1 category-page, category-list                 | slug / `_id`                                                                                                                                                                                         | `wix-stores/categories/list`                                                                                     | assumed for v1 — verify                          |
| wix-data item/list/table/card (dynamic)                    | **`collectionId` on the materialized `.jay-contract`** (primary); fallback `metadata.collectionId` in `plugins-index.yaml`. Never derive from contract name. `collections.yaml` for field types only | `wix-cms/data/{collectionId}` (encode `/` as `%2F` in path); no per-item URL                                     | docs; namespaced ids — use `%2F` (gate verified) |
| wix-forms wix-form                                         | prop `formId` (else config `defaultFormId`)                                                                                                                                                          | `wix-forms/form/{formId}`; list `wix-forms`                                                                      | docs                                             |
| wix-bookings booking-flow                                  | services itemId (`id`)                                                                                                                                                                               | `bookings/services/form/{serviceId}`; list `bookings/services`                                                   | docs                                             |
| wix-pro-gallery pro-gallery                                | prop `galleryId`; slide = itemId                                                                                                                                                                     | not in routes.json. Find live: gallery route → else galleries list → else `home`. Never Media Manager (TL;DR #9) | unknown — **blocking** verify                    |
| wix-cart cart-indicator, cart-page, mini-cart              | session                                                                                                                                                                                              | —                                                                                                                | `readonly: true`                                 |
| wix-members login-indicator, auth-callback, protected-page | session                                                                                                                                                                                              | —                                                                                                                | `readonly: true`                                 |

### Pro Gallery guide (what users ask, where it goes)

| Request                                                                                                      | Where                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Replace a slide's photo; change title/description/alt text; change a slide's link; add/remove/reorder slides | Dashboard (gallery URL); name `galleryId` + slide title/`itemId`         |
| Autoplay on/off, speed, loop                                                                                 | `autoplay` / `intervalMs` / `loop` props in jay-html — check there first |
| Show a different gallery                                                                                     | `galleryId` prop in jay-html                                             |
| Buttons, layout, slide CSS                                                                                   | Template (jay-html/CSS)                                                  |
| Native Pro Gallery widget settings (spacing, chrome)                                                         | Not used by Jay rendering; say so, edit the template instead             |

The guide also says: slide images are Wix media files, but a slide's image is replaced in the Pro Gallery editor, not by editing `{url}` in jay-html. Images the user attaches for **non-bound** markup follow the wix-media agent-kit guidance, not this guide.

### Readonly reply

`editingGuide` and `readonly: true` are mutually exclusive in `plugin.yaml`, so cart/members contracts get **only** `readonly: true` (no designer guide file — removed 2026-11-04). The worker should treat session carts/login as non-editable content and avoid hard-coded binding overrides (see [Authoritative summary #6](#authoritative-summary-2026-11-04)). Booking-flow is not readonly: its `editingGuide` gives the services dashboard route and states the slot/selection part of this reply inline.

> **Historical:** early drafts put readonly reply text in repo-root `INSTRUCTIONS.md` or `wix-*-session-state.md` designer files; neither is the current model for cart/members.

### Finding the guide

Until plugins-index carries `editingGuide` (jay follow-up), the agent finds a **static** contract's guide in the plugin's `plugin.yaml` by contract name (`contracts[].editingGuide`). Each guide's first line names its plugin and contract, so a guide found any other way is still identifiable. Dynamic contracts use the agent-kit section (below).

Booking slots/selection are flow state, not editable content; the booking-flow guide says so. wix-media has no contracts, so nothing to do there.

### Dynamic contracts (interim → materialized headers)

The jay `dynamic_contracts` schema still has no `editingGuide`/`readonly` on the manifest. **Implemented pointer (wix, no jay change):** plugins that **generate** contracts write top-level fields into materialized `.jay-contract` YAML — **wix DL #39** (wix-data: `collectionId` + shared `editingGuide` under `agent-kit/references/wix-data/`) and wix-stores `product-page` (`editingGuide` → stores designer guide). Agent-kit **designer** markdown remains the procedure; the contract file is how the agent finds it. Jay follow-ups (index surfacing, schema) remain optional.

### Feedback loop (jay-feedback)

- **Agent-kit:** the `editingGuide` files themselves, plus the interim dynamic-contract section above. Also one line in the wix repo-root `agent-kit/plugin/INSTRUCTIONS.md` (not the copies under `examples/*/agent-kit/`, which are materialized): "every plugin contract must declare `editingGuide` or `readonly`; dashboard content uses `getDashboardUrl`; for a `readonly: true` contract, give the readonly reply (below)".
- **Validation:** coverage comes from `jay-stack validate-plugin` (`source-editing-coverage`). Add `validate-plugin` for each changed package to the verification run. No new wix-side validator: it would duplicate jay's, and dynamic coverage belongs in jay (follow-up).

## Implementation Plan

**Phase A — action + gate** (no guides yet)

1. wix-server-client: extract `readWixConfig()` from `setup.ts` for reuse; add `lib/actions/get-dashboard-url.jay-action` + handler `lib/actions/get-dashboard-url.ts`, built with `makeJayAction` like other wix actions, re-exported from `lib/tools.ts` (devOnly actions load from `./tools`); `plugin.yaml` `actions`; `definitions` + `build:copy-actions` scripts and the `./get-dashboard-url.jay-action` export, following `wix-data/package.json`.
2. Unit tests: apiKey siteId used; `loadConfig()` throws (no `.wix.yaml` / no `oauthStrategy`) → falls back to `wix.config.json`; `kind: 'visitor'` and `kind: 'app'` → fall back; neither source → error naming both; path: leading `/` stripped, empty / `..` / `://` / `?` rejected.
3. **Gate:** Verification #1 on the test site: one stores product URL and one CMS collection URL first (siteId == metaSiteId), then every assumed/unknown row (v1 stores, namespaced CMS ids (record whether the dashboard path takes `Blog/Categories` as-is or encoded; encoded would need the path charset widened), pro-gallery: search the live dashboard, incl. links outside `routes.json`). Update the table to verified paths. Stop and report if siteId ≠ metaSiteId.

**Phase B — guides** (after A's table is all verified) 4. One `editingGuide` per static dashboard contract (verified table, Pro Gallery guide section); cart/members get `readonly: true` only (no guide file; reply text via INSTRUCTIONS.md).

**Phase C — agent-kit + demo** 5. Agent-kit dynamic-contract sections (wix-stores, wix-data) + the INSTRUCTIONS.md line. 6. `validate-plugin` per changed package; demo in AIditor (`/demo-feature`).

## Examples

| Request on selected element                     | ❌ Wrong                                       | ✅ Right                                                                                                                                          |
| ----------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Change this product name" (product list item)  | Replace `{name}` in jay-html with literal text | `getDashboardUrl` with `wix-stores/products/product/{itemId}`; reply with URL; empty diff                                                         |
| "Fix this article title" (CMS item)             | Edit jay-html or call a data write             | Resolve `collectionId` from the materialized `.jay-contract` (DL #39); `getDashboardUrl` with `wix-cms/data/{collectionId}`; reply names the item |
| "Replace this slide's photo" (pro-gallery item) | Edit `{url}` / link Media Manager              | Gallery route per TL;DR #9, naming `galleryId` + slide title                                                                                      |
| "Make the slideshow slower"                     | Send to dashboard                              | Edit `intervalMs` on `<jay:pro-gallery>` in jay-html                                                                                              |
| "Change cart count"                             | Hard-code a number                             | Readonly reply                                                                                                                                    |

## Verification Criteria

1. On the test site, open the URL from `getDashboardUrl` for each table row and confirm it shows the expected record/page (this also confirms API-key siteId == metaSiteId). Every "assumed"/"unknown" row ends as verified or changed; for pro-gallery, the table records which fallback level (gallery / list / `home`) was found.
2. `jay-stack validate-plugin` on each changed package: zero `source-editing-coverage` warnings.
3. `jay-stack action wix-server-client/getDashboardUrl --input '{"path":"wix-stores/products"}'` returns the URL. With no siteId configured, it fails with the TL;DR #4 message.
4. AIditor run: select a product name in a product list, ask "change this name"; the agent replies with the product's dashboard URL and `git diff` is empty; the dev-server action log shows only `getDashboardUrl` (and `getProductBySlug` where used) — no write or non-devOnly action; the Wix record is unchanged in the dashboard. Repeat for a CMS item (collection URL), the cart indicator (readonly reply), and a pro-gallery slide ("change this photo" → gallery URL naming the gallery, empty diff; "make it slower" → `intervalMs` edited in jay-html).
5. Production build of the example: `grep -r getDashboardUrl <example>/build` returns nothing.

## Trade-offs

- Templates in markdown aren't type-checked; live checks (#1) cover that. In return, there's no new code per plugin.
- CMS and categories link to a list, not the record, because Wix has no per-item URL.
- The gallery fallback (`home` + gallery id) is weak until a gallery or galleries-list route is found live; we accept that over a wrong Media Manager link.

## Scope pre-mortem

- _siteId mismatch_ (API-key site id ≠ metaSiteId) → all URLs break. Caught by check #1 before anything else.
- _Agent skips the guide for dynamic pages_ → interim agent-kit text, guarded by the CMS AIditor check (Verification #4); the real fix is the jay follow-up.
- _Scope creep into writes_ → explicitly out of scope (TL;DR #7).

## Open Questions

1. **Pro Gallery outcome (product):** is the answer always "open the dashboard", or do we later want "replace this slide from an attachment" like stores? This log assumes the former; the latter needs its own design log with new devOnly actions.

## Follow-ups (jay, public surface)

- Allow `editingGuide` / `readonly` on `dynamic_contracts` entries and cover them in `source-editing-coverage`.
- Surface `editingGuide` in plugins-index.
- Make the jay guide match the code: coverage is checked by `jay-stack validate-plugin`, not `jay-stack validate`.
- Document how agents call devOnly actions (`jay-stack action` / `/_jay/actions/...`).

## Implementation Results

**Status: Phase A + B implemented; Phase C QA done (5 ✓ / 1 partial / 2 ✗).** Product decision on finding 1 (allow writes) applied 2026-11-03; finding 2 (page-only overrides) needs the jay `editingGuide` follow-up. _Superseded — see **Final status and decisions (2026-11-03)** below._

### Phase A — `getDashboardUrl` (wix-server-client)

- `lib/actions/get-dashboard-url.ts` (+ `.jay-action`), re-exported from `lib/tools.ts`, `devOnly: true`; `readWixConfig()` moved to `lib/wix-config-file.ts` and reused by `setup.ts`. `definitions` / `build:copy-actions` / `./get-dashboard-url.jay-action` export as in wix-data.
- Tests: `test/get-dashboard-url.test.ts` — **23/23** passing in the package (siteId precedence incl. visitor/app/missing `oauthStrategy`/no files; path rules).
- `jay-stack action wix-server-client/getDashboardUrl` returns the URL (Verification #3 ✓). The production `dist/index.js` has no `getDashboardUrl` (only `dist/tools.js`).

### Phase A gate — live routes (test site, recorded)

API-key `siteId` == `wix.config.json` siteId == dashboard metaSiteId (dashboard home opens the test site) ✓.

| Row                      | Path                                                                                                                                                                                                                                | Result                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| stores product           | `wix-stores/products/product/{productId}`                                                                                                                                                                                           | ✓ opens the product editor                                                                                             |
| stores list / categories | `wix-stores/products`, `wix-stores/categories/list`                                                                                                                                                                                 | ✓                                                                                                                      |
| wix-stores-v1            | same Stores app pages                                                                                                                                                                                                               | route ✓; v1-catalog data not testable on this (Catalog V3) site                                                        |
| CMS collection           | `wix-cms/data/{collectionId}`                                                                                                                                                                                                       | ✓ for `Articles`                                                                                                       |
| CMS namespaced id        | `wix-cms/data/Bookings/Services`                                                                                                                                                                                                    | ✗ "Couldn't load this page"; **`Bookings%2FServices` ✓** → path charset now allows `%XX` (decoded `..` still rejected) |
| forms                    | `wix-forms/form/{formId}` (→ `/edit`), `wix-forms`                                                                                                                                                                                  | ✓                                                                                                                      |
| bookings                 | `bookings/services/form/{serviceId}`, `bookings/services`                                                                                                                                                                           | ✓                                                                                                                      |
| pro-gallery              | not in routes.json; `app/{appDefId}` and `wix-pro-gallery` / `pro-gallery` / `progallery` / `gallery` → "page isn't available"; Manage Apps lists Pro Gallery **without an Open button**; dashboard search finds only help articles | **no dashboard page** → tier 3 `home` (TL;DR #9)                                                                       |

### Phase B — guides

One guide per plugin under `agent-kit/designer/<plugin>-dashboard-content.md` (stores, stores-v1, forms, bookings, pro-gallery, wix-data), `editingGuide` on every static contract; `readonly: true` on cart and members contracts. `jay-stack validate-plugin` with the coverage-aware validator (jay `main`) — **0 `source-editing-coverage` warnings** on all 9 packages; the same validator warns 3× on `main`'s wix-cart `plugin.yaml` (rule proven to fire). The published 0.25.5 validator does not have the rule yet.

### Deviations

1. `makeJayQuery` instead of `makeJayAction` — it is a read; matches `getMediaSettingsStatus`.
2. Path charset also allows `%XX` escapes (gate finding above).
3. One guide file per plugin (not per contract): contracts of one plugin share the same steps; the file opens by naming plugin + contracts.
4. Readonly reply text shipped initially as `agent-kit/designer/wix-cart-session-state.md` / `wix-members-session-state.md` — **removed 2026-11-04**; cart/members use `readonly: true` only (see reconcile table).
5. The same per-plugin **designer** file is the guide content for static contracts; **dynamic** contracts point at it (stores) or at the copied wix-data reference guide via **`editingGuide` on the materialized `.jay-contract`** (DL #39).

### Phase C — AIditor QA (real agent runs)

- Pro Gallery "replace this photo": no source edit, followed the guide (quoted it), named the gallery, Editor not Media Manager ✓. It skipped the `home` link, and named the wrong slide: the marker carries only x/y, and with autoplay the worker read the slide from a later screenshot.
- **Stores "change this product name" ✗ (finding 1):** the worker never opened the wix-stores guide, ran `cat config/.wix.yaml` (API key in its transcript), then renamed the live product with `curl -X PATCH` using that key (it also tried the claude.ai Wix MCP). Product name restored after the run. Remaining cases were stopped: they would hit the same path.

**Finding 1 — the guide-only model is not enough.** A guide is advisory. An agent that has the API key on disk and a Wix MCP will write when it doesn't read the guide. Options for product: (a) make the guide unmissable — the AIditor passes the contract's `editingGuide` with the selected element (jay follow-up "surface `editingGuide`" becomes blocking); (b) keep the key out of reach of the agent (deny reads of `config/.wix.yaml` in the AIditor agent's permissions); (c) a validation/permission rule; or accept writes (the earlier rejected design). (a)+(b) together match this design.

### Product decision on finding 1 (2026-11-03)

Product approved direct writes: **an agent that knows how, and has access, may update the data at its source**, even when the contract's guide only describes the dashboard. Deviation 6: the five dashboard guides now say "**Do not edit code.** If you can update the data at its source (a Wix API or tool you have access to), you may do so and say exactly what you changed; otherwise give the dashboard link below." (was "do not edit code and do not write data"). Pro Gallery, cart and members guides are unchanged.

### Phase C — full QA run (2026-11-03, 8 cases, real AIditor agent runs, recorded)

Pass = no jay-html edit for content; data updated at the source **or** the dashboard link given. Live data was restored after each run.

| Case                     | Request                      | Result                                                                                                                                                             |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01 stores product name   | rename the spotlight product | ✓ renamed in the Wix Stores catalog; no source diff                                                                                                                |
| 02 CMS article title     | rename the marked article    | ✓ renamed the marked `Articles` item in the CMS; no source diff                                                                                                    |
| 03 forms field label     | rename a field label         | ✗ **no data change; hard-coded the label in jay-html** (`<span if="target === 'first_name_f409'">Your first name</span>`); offered the dashboard as an alternative |
| 04 bookings service name | rename the service           | ~ no source edit, identified the service id, but neither renamed it nor gave the dashboard **URL** (directions in words; asked to use the Wix MCP)                 |
| 05 cart count (readonly) | "show 3 here instead of 0"   | ✗ **replaced `{cart.itemCount}` with a hard-coded `3`** in jay-html; no session-state reply                                                                        |
| 06 gallery photo         | replace a slide photo        | ✓ no source edit; Editor gallery manager, `home` link, named the slide; no Media Manager                                                                           |
| 07 gallery autoplay      | slower slideshow             | ✓ `intervalMs` 4000 → 8000 on `<jay:pro-gallery>`                                                                                                                  |
| 08 hard-coded heading    | change an `<h2>`             | ✓ text edited in jay-html — guides don't block markup edits                                                                                                        |

**5 ✓ / 1 partial / 2 ✗.**

**Finding 2 — "a page-only override" is the remaining failure mode.** In 03 and 05 the worker chose to hard-code a value over the binding, scoped to one page, instead of following the guide — and in 05 it discarded live session state. Both contracts carry `editingGuide` / `readonly`, but nothing puts them in front of the worker. This supports option (a) of finding 1: the AIditor should send the selected element's `editingGuide` / `readonly` with the request (jay follow-up "surface `editingGuide`" → blocking). A validation can't catch it: the hard-coded override is valid jay-html.

### wix-stores guide rewrite (2026-11-03)

Deviation 7: a category deep link exists — `wix-stores/categories/list/category/{categoryId}` (seen live in the dashboard), replacing "no category deep link" for wix-stores `category-list`. Deviation 8: `wix-stores-dashboard-content.md` now resolves the record mechanically from the inspector `stack` + the page jay-html: page-level (`key=`) contracts emit **no** `region` frame, so the products list is matched by its `forEach` attribute (`K.searchResults`, `K.products`, `products` inside `<jay:category-products>`); product pages take the slug from the script body (static pages) or the `[slug]` route param. Writes (deviation 6) stay allowed, but only with an id from these steps. wix-stores-v1 collections still say "no per-collection link" — not verified.

### QA — rewritten wix-stores guide (2026-11-03, 3 cases, real AIditor runs, recorded)

Testbed page `/shop` added: page-level `product-search` (`key="search"`) grid + `category-list` (`key="cats"`) chips. The category deep link opened live to the category editor before the runs. Data restored after each run.

| Case                                              | Request             | Result                                                                                                                                                                                      |
| ------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 product page (`/products/:slug`, Baseball Cap) | rename the product  | ~ no source edit, identified the product by slug, but **no dashboard link**: Wix MCP wasn't authorized, so it replied with words ("Dashboard → Stores → Products") and asked for permission |
| S2 store grid (`/shop`, 2nd card)                 | rename the product  | ✓ the right product (Minimalist Tote Bag, from the inspector `itemId`) renamed in Wix Stores; no source diff                                                                                |
| S3 category (`/shop`, `test2` chip)               | rename the category | ✓ the right category renamed (dashboard shows "Home & Living"); no source diff                                                                                                              |

**Finding 3 — the guide is still not read.** None of the 3 workers opened `wix-stores-dashboard-content.md`; none called `wix-server-client/getDashboardUrl`. S2/S3 found the right id because the inspector `itemId` is the trackBy `_id`, then wrote with the API key read from `config/.wix.yaml`. S1 had no write path and fell back to directions instead of step 3's link. Right outcomes in S2/S3 are not evidence the guide works; finding 2's fix (the AIditor passes `editingGuide` with the selection) is still the blocker.

### All guides on the mechanical lookup (2026-11-03)

Deviation 9: every `editingGuide` / readonly guide (stores-v1, forms, bookings, wix-data, pro-gallery, cart, members) now follows the stores guide's shape: what the inspector returns; a lookup table matching `forEach` + `trackBy` attributes (page scripts give `K.<list>` and no `region` frame); plugin check; write only with an id from the steps; one fallback section; link + write reply wording. Fixes found on the way:

- **bookings** — "or the currently selected service" had no id source (the contract exposes only `selectedServiceName`) → services-list link, no lookup by name.
- **cart** — a cart line's `itemId` is a `lineItemId`, not a product id → products-list link, no product writes from the cart.
- **forms / cart / members** — explicit "never hard-code a value or replace a binding, not even for one page" (QA cases 03 and 05).
- **wix-data** — page scripts (`list/…` with `key`) have no region frame; item `_id` from `K.items`; **collection id from `collectionId` on the materialized `.jay-contract`** (not from contract name; plugins-index metadata is fallback only).
- **pro-gallery** — trust `itemId` over screenshots (QA 06 autoplay mis-read).

Not live-tested yet; stores-v1 per-collection link still unverified.

### Final status and decisions (2026-11-03)

**Decisions taken (product, after implementation started):**

1. **Writes are allowed.** An agent that knows how and has access may update the data at its source, even when the guide only describes the dashboard (replaces TL;DR #1's "no data" rule; deviation 6). It must never write without an id from the guide's steps.
2. **One complete reply, then wait.** For dashboard-managed content the agent replies once, in 1–3 plain sentences: where the content comes from, the record's dashboard link, and — only when a tool that can make the change is available — an offer to do it, with the permission request in the same reply. No file paths, code or component names in the reply.
3. **Links must come from `getDashboardUrl`.** The agent never constructs a dashboard URL; a link that no tool or guide returned is dropped. Guides give the exact command (`npx jay-stack-cli action wix-server-client/getDashboardUrl --input '{"path":"…"}'`) and forbid reading `config/.wix.yaml` or other credential files to build it.
4. **Generated contracts name their guide themselves — no jay change.** A plugin that generates and materializes contracts writes `editingGuide:` (and, for wix-data, `collectionId:`) into the generated contract (wix DL #39). A jay-side alternative (guide fields in the plugins index for dynamic contracts) was drafted and dropped as unnecessary.
5. **Pro Gallery on headless** → not dashboard-managed for slide content; Pro Gallery API or honest reply (see Authoritative summary #7). ~~tier 3 `home` + Editor gallery manager~~ superseded 2026-11-04.
6. **Session state is readonly** (cart, members): explain, edit nothing, never replace a binding with a fixed value.

**Implemented in this repo (local commits on `source-editing-dashboard-urls`):**

| Change                                                                                                                                                                                                                | Where                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `getDashboardUrl` devOnly action, 23/23 tests                                                                                                                                                                         | `packages/wix-server-client`                                                                            |
| Guides on the mechanical lookup for stores, stores-v1, forms, bookings, data, pro-gallery; cart/members **`readonly: true` only** (no session-state designer guides)                                                  | each package's `agent-kit/designer/` (+ wix-data reference copy under `agent-kit/references/wix-data/`) |
| Generated wix-data contracts carry `collectionId` + shared `editingGuide` (`agent-kit/references/wix-data/wix-data-dashboard-content.md`; stubs dropped 2026-11-04)                                                   | wix DL **#39**                                                                                          |
| Exact `getDashboardUrl` command + no-credential-files rule in the CMS guide                                                                                                                                           | `646926a`                                                                                               |
| Generated wix-stores `product-page` contract carries `editingGuide: agent-kit/designer/wix-stores-dashboard-content.md` (repro test `test/product-page-contract-yaml.test.ts`); same command line in the stores guide | `f5b01d6`                                                                                               |
| Rich-text form label `[object Object]` fixed                                                                                                                                                                          | `1508ee4`                                                                                               |

All generated contracts across the wix packages now name their guide (only wix-data and wix-stores generate contracts).

**Final QA (real editor agent runs, recorded; plain user requests such as "Change this to …"):**

| Case                                                                         | Reply                                                                                                                       | Link         |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Product page title                                                           | "The product name "Baseball Cap" comes from your Wix Stores catalog… You can change it to "Classic Field Cap" here: <link>" | ✓ product    |
| Store grid product name                                                      | one short reply                                                                                                             | ✓ product    |
| Store grid product image ("Change this image to a photo of a blue tote bag") | one short reply                                                                                                             | ✓ product    |
| Category chip                                                                | one short reply                                                                                                             | ✓ category   |
| CMS article title                                                            | "This article title comes from your Wix CMS (the Articles collection)… rename it here: <link>"                              | ✓ collection |

Each comment got one reply, the thread was idle afterwards, no code changed, and the workers followed the contract's `editingGuide` and ran `getDashboardUrl` without reading credentials. Live data unchanged (restored where a run wrote).

**Open:**

- Recording the write path after the user allows a tool needs a Wix MCP server configured for the project (`.mcp.json`) — a site-owner setup step.
- The testbed API key appeared in agent transcripts during early QA runs (before the no-credential-files rule) — rotate it.
- wix-forms / wix-bookings `build:types` wait on a jay release (below).
- stores-v1 per-collection link and the forms / bookings / members / pro-gallery guides were not re-recorded after the mechanical-lookup rewrite.

### Other findings (outside this log)

- jay: `<jay:…>` instance components render empty when a sibling element (e.g. `<header>`) precedes their container in `<body>`. **Fixed in jay** (coordinate assignment now numbers every body child; the "mixed keyed + instance imports" case was the same cause). Reaches wix with the next jay sync/release.
- wix-forms: a rich-text field label renders `[object Object]`. **Fixed** in `1508ee4` — `projectFormFields` now flattens Ricos label content to plain text (repro: `packages/wix-forms/test/rich-text-label.test.ts`).
- wix-forms / wix-bookings `build:types` fail on `main` (`ttl` not in `PhaseOutput` type of the installed jay). **Cause:** the wix code correctly uses jay's slow-phase `ttl`/`grace` (jay stale-while-revalidate feature), but the published `@jay-framework/*@0.25.5` on npm predates it; jay `main` declares it while still at version 0.25.5. **Fix needs a jay release** carrying that feature, then a dependency bump in wix (or `node sync-jay-packages.cjs ../jay` locally). No wix code change.

**2026-11-04 — Drop wix-members session-state designer guide.** Product review: members has no dashboard-managed content; all three contracts stay `readonly: true` in `plugin.yaml` with no `editingGuide`. Owner-facing asks are layout/copy in jay-html (normal designer work) and setup (`agent-kit/plugin/wix-members-setup.md`). Removed `packages/wix-members/agent-kit/designer/wix-members-session-state.md`.

**2026-11-04 — Drop wix-cart session-state designer guide.** Same pattern as members: `cart-indicator`, `cart-page`, and `mini-cart` are all `readonly: true` in `plugin.yaml` with no `editingGuide`. Counts and line items are visitor session state; layout is jay-html. Catalog fields on a line item belong to wix-stores when the marked element is store data. Removed `packages/wix-cart/agent-kit/designer/wix-cart-session-state.md`.

**2026-11-04 — Remove unused shared agent-behavior stub.** `wix/agent-kit/designer/dashboard-content-agent-behavior.md` was never referenced (not copied by `jay-stack agent-kit`; no include mechanism). Shared reply/write/ambiguity wording lives **inlined** in each `packages/*/agent-kit/designer/*-dashboard-content.md` — edit those files when changing agent behavior.

**2026-11-04 — Pro Gallery on Wix Headless (supersedes decision #5 for slide content).** Recorded walkthrough (`dl38-pro-gallery-dashboard-walkthrough-v2-20261104.mp4`) and DL #64 T6 (`dl64-qa-change-request-T6-pro-gallery-slide-image-20261104.mp4`) on the headless testbed:

- **Runtime:** Jay `wix-pro-gallery` read path works — slide content loads live by `galleryId`; a Pro Gallery API `PATCH` on an item updates the live `/gallery` page with no jay-html change (then restored).
- **Dashboard:** Confirmed again — no Pro Gallery sidebar entry, search returns help only, Manage Apps has no **Open** for Pro Gallery, Wix Editor returns 400 on headless. There is **no owner-facing visual screen** to edit slides (unlike Forms, Stores, Bookings).
- **Product / UX:** For typical non-technical headless site owners, Pro Gallery slide content is **not** dashboard-managed in practice; changes require the Pro Gallery API or an agent with Wix access. Sending owners to dashboard **home** or the **Editor** was a dead end — the prior guide and decision #5 ("tier 3 home + Editor gallery manager") were wrong for Jay headless sites.
- **Guide fix:** Rewrote `packages/wix-pro-gallery/agent-kit/designer/wix-pro-gallery-dashboard-content.md` (and the testbed copy under `wix-store-e2e/agent-kit/designer/`): headless-first section; **do not** use `getDashboardUrl` / home or Editor for slide **content**; document Pro Gallery API `PATCH …/galleries/{galleryId}/items/{itemId}` for agents with Wix tools; owner reply offers agent help after Wix connection when no tool yet; classic Editor path only when the site actually has an Editor.
- **Still open (unchanged from Open Questions):** devOnly Jay actions for gallery writes (parity with stores image updates) — separate design log if product wants attachment → slide without raw REST in the guide. DL #33 (plugin scope) stays read-only + navigation; no contract/README change in this pass.

**2026-11-04 — Pro Gallery guide: not dashboard-managed on headless.** Product/architecture review: slides are Pro Gallery API data, but Jay headless sites have **no** Pro Gallery screen in the site dashboard and no Editor (see gate table row pro-gallery → tier 3 `home` was a weak fallback). **Decision:** keep `editingGuide` on `pro-gallery` (slide content is not jay-html), but rewrite `packages/wix-pro-gallery/agent-kit/designer/wix-pro-gallery-dashboard-content.md` — do **not** send owners to dashboard `home` or the Editor by default on headless; prefer Pro Gallery REST (PATCH item, etc.) when the agent has Wix API access, honest replies when not; Classic Editor gallery manager only when the site is known to use the Editor. Autoplay / `galleryId` / layout stay jay-html props and template (unchanged from TL;DR #8).

**2026-11-04 — Reconcile earlier sections (supersedes where they conflict).**

| Earlier text in this log                                                                         | Still true?   | Current rule                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision **#6** + deviation **4** (`wix-cart-session-state.md` / `wix-members-session-state.md`) | **No**        | Cart and members: **`readonly: true` only** in `plugin.yaml`; no session-state designer files. Session semantics come from the contract flag + normal designer docs (layout) and plugin setup (members). |
| Implemented table row “readonly guides for cart, members”                                        | **No**        | Those guides were removed; coverage is `readonly: true` without `editingGuide`.                                                                                                                          |
| Deviation **9** listing cart/members alongside dashboard guides                                  | **Partially** | Cart/members are no longer guide-shaped; stores, data, forms, bookings, pro-gallery guides remain. **wix-data** uses materialized contract headers (DL #39), not a separate agent-kit-only path.         |
| Design § “reply text via INSTRUCTIONS.md” for cart/members (lines ~132–134)                      | **No**        | Never shipped that way; deviation 4 used package designer files, now dropped entirely for cart/members.                                                                                                  |
| DL #39 wix-data `editing-guides/` stubs (2026-11-03 ship)                                        | **No**        | Removed 2026-11-04; all wix-data contracts share one `editingGuide` reference path — see **wix DL #39** Authoritative summary.                                                                           |

Related: wix DL **#39** — wix-data `collectionId` + single shared `editingGuide` on each materialized contract.
