# 38 — wix-stores Source Editing: per-contract editing guides + devOnly product write actions

Status: **[Design]**. Awaiting Noam's review. He asked for the draft and said implementation does not have to wait for his review.

## Decisions for the Implementer (TL;DR)

1. **Scope: `@jay-framework/wix-stores` (Catalog V3) only.** `wix-stores-v1` is out of scope and can follow the same pattern later.
2. **Two `devOnly` write actions, plus one read action.** Each one has a `.jay-action` file, so it is listed in `agent-kit/plugins-index.yaml`:
   - `updateProductMainImage({ slug | productId, imageUrl, altText?, keepPrevious? })`. **Required for the demo.**
   - `updateProductText({ slug | productId, name?, plainDescription? })`. Optional, but cheap to add.
   - `getProductForEditing({ slug | productId })`. Resolves `slug → productId` and returns the current name, description and media, so the agent can confirm before it writes.
3. **The main image is set through `media.itemsInfo.items[0]`.** `media.main` is read-only, and Wix sets it to the first item. The new item is `{ url: imageUrl }`, an external URL that Wix imports. **No separate `@wix/media` `importFile` step.** Existing items are re-sent as `{ _id }`.
4. **Write = `PATCH /stores/v3/products/{id}`**, with the current `revision` read just before the write. It goes through the existing `wixFetch`, following the REST-over-SDK pattern of `lib/wix-apis/*`.
5. **Editing guides are markdown files in `agent-kit/designer/`.** Jay 0.25.5 already copies them into the project's `agent-kit/designer/` and lists them under "Plugin-Contributed Guides" in `designer/INSTRUCTIONS.md`, which the AIditor agent reads. They are **also** referenced from `plugin.yaml` `editingGuide:` (honoured by jay `main`, ignored by 0.25.5). On top of that, a one-line pointer goes in each contract `description`, which reaches `plugins-index.yaml` on both versions.
6. **Coverage:** `product-page`, `product-search`, `category-products` and `product-spotlight` get guides. `category-list` is `readonly: true` because category editing is out of scope.
7. **Writes need `apiKeyStrategy`** with the *Manage Products / Wix Stores* permission. With visitor or OAuth-only config, the actions throw a clear `ActionError`.
8. **After a write, the dev slow-render cache is stale.** The cache is on disk and is only invalidated by file changes. The guide tells the agent how to refresh (see §Design 5). A proper invalidation hook is a Jay framework follow-up.

## Background

Jay's source-editing feature lets the AIditor turn a comment on the live page into a "Target source": the jay-html file and lines, the tag, the enclosing `forEach` item id or region contract name, and `contentFromBinding` when the content comes from data. For **bound** content, the agent must not edit the jay-html. It resolves the contract and follows the plugin's **per-contract editing guide**. The guide is markdown, declared per contract in `plugin.yaml` as `editingGuide: <path.md>` or `readonly: true`, and points at **`devOnly` actions** (handlers in the plugin's `./tools` entry, registered by the dev server, never in production) that write the data where it lives.

Target demo: a Jay site on a Wix Headless store. The user is on a product page, comments on the product image "change this image to X", and the agent updates the product's image in the Stores catalog through the Wix APIs.

## Problem

`wix-stores` has no editing story. When the agent sees `<img src="{mediaGallery.selectedMedia.url}">` with `contentFromBinding`, it can identify the `product-page` contract but cannot tell:

- which **record** it is. The route param is `slug`, but the Wix APIs key by `productId`.
- what the **write path** is. Today every wix-stores action is a read query (`lib/actions/stores-actions.ts`).
- that `media.main` cannot be written directly.

## Prior Art / Adjacent Mechanisms

| Mechanism | Verdict |
| --- | --- |
| `wix-media` devOnly actions (`uploadMediaFile`, `createMediaFolder`, …), exported from `lib/tools.ts` | **Reuse the pattern.** Note that they have no `.jay-action` file, so they are *not* in `plugins-index.yaml`. Ours must have one. |
| `lib/wix-apis/*` with `wixFetch` (REST, no `@wix/stores` dependency; DL #22, #26) | **Reuse.** Add `update-product.ts` next to `get-product.ts`. |
| `agent-kit/designer/*.md` in the plugin (e.g. `related-products.md`) | **Reuse** as the delivery channel on 0.25.5: copied and indexed by `jay-stack agent-kit`. |
| Contract `description` → `plugins-index.yaml` | **Reuse** for a one-hop guide pointer, since 0.25.5 has no `editingGuide` surfacing. |
| `jay-stack action <plugin>/<action> --input <json>` | **Reuse.** This is how the agent calls the write action from Bash. It uses the same plugin-action discovery as the dev server, including devOnly actions from `./tools`. |
| `wix-utils` `formatWixMediaUrl` / `parseWixMediaUrl` | **Reuse.** Rendering already handles both `https://` URLs and Media Manager ids. Parsing turns `wix:image://` URLs into `_id`. |

**Null hypothesis.** Could the agent use the generic `@wix/*` SDK or REST directly, with no plugin actions? Rejected. The agent has no credentials of its own: they live in `config/.wix.yaml` and are loaded by `wix-server-client`. It would also need to rediscover the slug→id lookup, the revision rule and the media-array semantics each time. A devOnly action captures that once, behind a reviewed input schema.

## Questions and Answers

**Q1. When replacing the main image, should the old main stay in the gallery?**
Proposed: **no**, replace it. `items = [{url: new}, ...existing.slice(1)]`. `keepPrevious: true` prepends instead. The user said "change this image", not "add an image".

**Q2. Does the image have to be imported into Wix Media first?**
No. `ProductMedia` is a one-of of `_id` (an existing Media Manager file) or `url` ("Set media using an external media URL", `@format WEB_URL`). Wix ingests the URL and the response carries a Media Manager id/url. An explicit `files.importFile` is only needed if we want the file in a chosen folder, or to wait for it to be ready. Out of scope.

**Q3. What if the user gives a description ("a red sneaker") instead of a URL?**
The guide tells the agent to ask for a public image URL, or to pick an existing Media Manager image from the `wix-media` agent-kit index when that plugin is installed (pass `wix:image://…`, and the action converts it to `_id`). A local file can be uploaded with `wix-media`'s devOnly `uploadMediaFile`, and the resulting id passed in. Image generation is out of scope.

**Q4. Should the guide also offer "open in the Wix dashboard"?**
Optional, not needed for the demo. A `getProductDashboardUrl` action could be added later (the URL shape needs verifying).

**Q5. Which agent-kit role gets the guides?**
`designer`. The AIditor agent reads `agent-kit/designer/INSTRUCTIONS.md` and `agent-kit/plugins-index.yaml`.

**Q6. Option-choice `linkedMedia` points at existing media ids. What happens if we drop the old main?**
That choice loses its image link. This is acceptable for the demo. The guide mentions it, and `keepPrevious: true` avoids it. *(Open, for Noam.)*

## Design

### 1. Record identity per contract

| Contract | How it renders | Record key (from the inspect result) | Guide instructs |
| --- | --- | --- | --- |
| `product-page` (dynamic) | `mediaGallery.selectedMedia.url` / `availableMedia[].media.url` (fast+interactive; built in the slow phase and carried forward), `productName`, `description` (html-string) | route param **`slug`** (`params: slug` in `product-page.jay-contract`) | `getProductForEditing({slug})` → confirm → `updateProductMainImage({slug, imageUrl})` |
| `product-search`, `category-products` | `products[]` → `product-card` (`mainMedia.url`, `name`), `trackBy: _id` | `forEach` frame **`itemId`** = product `_id` | `updateProductMainImage({productId: itemId, …})` |
| `product-spotlight` | `product` → `product-card` | region prop **`slug`** | `updateProductMainImage({slug, …})` |
| `category-list` | categories | — | `readonly: true` |

`product-search`, `category-products` and `product-spotlight` share one guide (`wix-stores-editing-product-cards.md`). Their write path is identical. Only the identity source differs, and the guide spells that out in a table.

### 2. API sequence: replace the main image

All calls go to `https://www.wixapis.com` through `wixFetch(wixStores.wixClient, …)`, which uses the `ApiKeyStrategy` headers.

```
1. Resolve: GET /stores/v3/products/slug/{slug}?fields=MEDIA_ITEMS_INFO   (existing getProductBySlug)
            or GET /stores/v3/products/{productId}?fields=MEDIA_ITEMS_INFO (existing getProduct)
   → product._id, product.revision, product.media.itemsInfo.items[]
2. Build:   items = [{ url: imageUrl, altText? }, ...rest.map(i => ({ _id: i._id }))]
            rest = keepPrevious ? items : items.slice(1)
            (imageUrl starting with "wix:" → { _id: parseWixMediaUrl(imageUrl).mediaId } instead of { url })
3. Write:   PATCH /stores/v3/products/{_id}
            { product: { id: _id, revision, media: { itemsInfo: { items } } }, fields: ["MEDIA_ITEMS_INFO"] }
   → product.media.main = the new image (Wix sets main = items[0])
4. On a revision-conflict error: re-read (step 1) and retry once.
```

Partial update: only `product.id` and `product.revision` are required, and omitted top-level fields are left unchanged. Repeated fields are overwritten as a whole array, which is why step 2 re-sends the full item list. `updateProductText` uses the same steps 1, 3 and 4, with `{ id, revision, name?, plainDescription? }`. `plainDescription` must be valid HTML and is converted to rich content.

Evidence: typings of `@wix/auto_sdk_stores_products-v-3@1.0.240`, the published SDK module for Catalog V3 products.

| Claim | Status |
| --- | --- |
| `media.main` is read-only and is set to the first item. `itemsInfo.items`: "first item … automatically set as the product's main media" (max 50) | ✅ `build/cjs/stores-catalog-v3-product-products-v-3.universal-*.d.ts` `interface Media` / `MediaItemsInfo` |
| An item is set by `_id` (Media Manager file) **or** `url` (external, `@format WEB_URL`) | ✅ same file, `ProductMediaSetByOneOf` |
| `updateProduct` requires `product.revision`. Partial-update rules. Arrays are overwritten | ✅ same file, JSDoc of `updateProduct` |
| REST: `PATCH`, host `www.wixapis.com`, `srcPath /stores/v3/products` → `protoPath /v3/products/{product.id}` | ✅ `build/cjs/index.js` (domain map + the `updateProduct` request builder), `meta.d.ts` (`__PublicMethodMetaInfo<'PATCH'`) |
| Body is `{ product, fields? }` | ✅ `interface UpdateProductRequest` |
| Permission is `WIX_STORES.PRODUCT_UPDATE` (scopes include *Manage Products*, *Manage Stores*, *Manage v3 catalog*) | ✅ `@permissionId` / `@permissionScope` tags in the same file |
| `plainDescription` is writable HTML (max 16000), `name` max 80 | ✅ `interface V3Product` |
| The `revision` field type is `string` | ✅ `interface V3Product`. Our local `wix-apis/types.ts` `V3Product` lacks it, so add it. |
| Optional import path: `@wix/media` `importFile(url)` → `POST /v1/files/import`, needs `MEDIA.SITE_MEDIA_FILES_IMPORT`, and the file is not immediately ready | ✅ `@wix/auto_sdk_media_files@1.0.105` `index.typings.d.ts`. Not used. |
| Wix fetches the external URL synchronously enough for the PATCH response/`GET` to return a usable `media.main.url` | ⚠️ assumed. Verify live in Phase 4. |
| The exact revision-conflict error code/status | ⚠️ assumed (409 / `REVISION_MISMATCH`-like). Retry on any 409. |
| A new Wix Headless site with Stores installed uses Catalog V3 | ⚠️ assumed. Verify with `GET /stores/v3/products` on the demo site. |

### 3. Actions

New file `lib/editing/editing-actions.ts`, exported from `lib/tools.ts` only (never from `lib/index.ts`). New API wrapper `lib/wix-apis/update-product.ts`. The pure function `buildMainImageItems(existingItems, imageUrl, { altText, keepPrevious })` lives in `lib/editing/media-items.ts`.

```yaml
# plugin.yaml
actions:
  # ...existing
  - name: getProductForEditing
    action: get-product-for-editing.jay-action
    devOnly: true
  - name: updateProductMainImage
    action: update-product-main-image.jay-action
    devOnly: true
  - name: updateProductText
    action: update-product-text.jay-action
    devOnly: true
```

```yaml
# lib/actions/update-product-main-image.jay-action
name: updateProductMainImage
description: >-
  DEV ONLY — source editing. Replace a Wix Stores product's main image in the Stores catalog
  (the image shown on product-page / product cards). Identify the product by slug (product-page
  route param) or productId (product-card forEach itemId). imageUrl is a public http(s) URL or a
  wix:image:// Media Manager URL. See agent-kit/designer/wix-stores-editing-product-page.md.
inputSchema:
  slug: string?
  productId: string?
  imageUrl: string
  altText: string?
  keepPrevious: boolean?
outputSchema:
  productId: string
  slug: string
  revision: string
  mainImageUrl: string
```

Handlers use `makeJayAction('wixStores.updateProductMainImage').withServices(WIX_STORES_SERVICE_MARKER)` and throw `ActionError` in these cases:
- neither `slug` nor `productId` is given (`MISSING_PRODUCT_IDENTITY`);
- the product is not found (`PRODUCT_NOT_FOUND`);
- the API returns 401/403 (`WRITE_NOT_AUTHORIZED`). The message says "writes need `apiKeyStrategy` in config/.wix.yaml with the Wix Stores *Manage Products* permission".

`getProductForEditing` uses `makeJayQuery` and returns `{ productId, slug, revision, name, plainDescription, media: { mainUrl, items: [{ id, url, mediaType }] } }`.

`package.json` `exports` gains the three `.jay-action` subpaths. `build:copy-contract` already copies `lib/actions/*.jay-action`.

### 4. Guides and how they reach the agent

New files, shipped under the existing `"files": ["agent-kit"]`:
- `agent-kit/designer/wix-stores-editing-product-page.md`
- `agent-kit/designer/wix-stores-editing-product-cards.md`

Guide content (imperative and short):
1. When to apply: a Target source whose binding resolves to this contract and has `contentFromBinding`, or a bound `src` / `{…}` expression.
2. Identity: which inspect-result field to read (route `slug` / `forEach` `itemId` / region `slug`).
3. Steps, as `jay-stack action wix-stores/getProductForEditing --input '{"slug":"…"}'` → confirm the product name with the user → `jay-stack action wix-stores/updateProductMainImage --input '{"slug":"…","imageUrl":"https://…"}'`.
4. Never hard-code the image or text into jay-html.
5. If there is no URL, see Q3.
6. Refresh step (§5).
7. Caveats: dropping the old main can remove an option-choice `linkedMedia` link, so use `keepPrevious`.

```yaml
# plugin.yaml (contracts)
  - name: product-search
    ...
    description: Headless product search page. Editing products shown here: agent-kit/designer/wix-stores-editing-product-cards.md
    editingGuide: ./agent-kit/designer/wix-stores-editing-product-cards.md
  # category-products, product-spotlight: same guide
  - name: category-list
    ...
    readonly: true
dynamic_contracts:
  - prefix: 'product-page'
    ...
    editingGuide: ./agent-kit/designer/wix-stores-editing-product-page.md # forward-compat; see table
```

The `product-page` contract `description`, in `lib/generators/product-page-contract-generator.ts` and in `lib/contracts/product-page.jay-contract` (keep the two in sync), gains this sentence: "Edit bound product data (image, name, description) at its source: agent-kit/designer/wix-stores-editing-product-page.md."

How each channel behaves on each Jay version:

| Channel | Jay 0.25.5 (published, `npm create jay`) | Jay `main` |
| --- | --- | --- |
| `editingGuide` on `contracts[]` | ignored. Unknown keys are not rejected. | ✅ read. `validate-plugin` checks that the file exists and warns when a contract declares neither a guide nor `readonly` |
| `editingGuide` on `dynamic_contracts[]` (product-page) | ignored | ❌ **not supported**. Only static `contracts[]` carry it. **Jay gap**, see Follow-ups |
| `editingGuide` surfaced in `plugins-index.yaml` | ❌ | ❌ (planned on the Jay side) |
| Plugin `agent-kit/designer/*.md` → project `agent-kit/designer/` + "Plugin-Contributed Guides" table in `designer/INSTRUCTIONS.md` | ✅ | ✅ |
| Contract `description` → `plugins-index.yaml` (static and dynamic) | ✅ | ✅ |
| devOnly actions registered by the dev server from `./tools`, and callable through `jay-stack action` | ✅ | ✅ |
| Actions with a `.jay-action` file listed in `plugins-index.yaml` (devOnly included) | ✅ | ✅ |

So on 0.25.5 the path is: `plugins-index.yaml` (contract description pointer + the action list) → guide file in `agent-kit/designer/` → `jay-stack action`. On `main`, `editingGuide` is added for the static contracts.

### 5. Freshness after a write

The dev server caches the slow render on disk (`build/pre-rendered`). In 0.25.5 the cache is only invalidated when a watched file changes (route `page.jay-html` / `page.ts` / contract / linked CSS or component). There is no TTL in dev, and no API a plugin action can call. Product media is built in the slow phase (`renderSlowlyChanging` → `carryForward.mediaGallery`), so a successful write stays invisible until the cache clears.

- **Demo / 0.25.5:** the guide tells the agent to `touch` the route's `page.jay-html` after a successful write. Only the mtime changes, no content. The watcher then clears the slow-render cache and sends a page reload. ⚠️ assumed: the watcher fires `change` on an mtime-only touch. Verify in Phase 4. The fallback is restarting the dev server.
- **Production:** `SLOW_RENDER_TTL` (600 s) / `SLOW_RENDER_GRACE` (DL #36) bound staleness; `jay-stack rebuild --url` refreshes immediately. Production writes are out of scope anyway (devOnly).

## Implementation Plan

1. **Phase 1 — API + pure logic (TDD).** Add `revision` to the local `V3Product` type. Add `wix-apis/update-product.ts` (PATCH). Write `editing/media-items.ts` `buildMainImageItems` with fixture tests in `test/fixtures/edit-main-image/` (input product JSON → expected `items` JSON; cases: replace, keepPrevious, `wix:image://` → `_id`, product without media).
2. **Phase 2 — devOnly actions.** Three `.jay-action` files, `editing/editing-actions.ts`, `tools.ts` exports, `plugin.yaml` entries, `package.json` exports. Unit-test the handlers with a mocked `wixFetch`: request path + body equal the expected fixture (`toEqual`), the retry on 409, and the error codes. `npm run build` (includes `validate-plugin`).
3. **Phase 3 — guides + coverage.** Two guide files, `editingGuide`/`readonly` in `plugin.yaml`, description pointers (generator + contract), README section.
4. **Phase 4 — live verification on the demo store.** `jay-stack action wix-stores/updateProductMainImage --input …` from a Jay 0.25.5 project linked to the demo site, then confirm with `getProductForEditing`. Then the AIditor demo: comment on the product image → the agent follows the guide → reload shows the new image. Record the video at the workspace root.

## Examples

✅ Agent flow for "change this image to https://example.com/red-sneaker.jpg" on `/products/air-runner`:
```
Target source: page.jay-html L42 <img src="{productPage.mediaGallery.selectedMedia.url}"> contentFromBinding
→ productPage = wix-stores/product-page → agent-kit/designer/wix-stores-editing-product-page.md
→ jay-stack action wix-stores/getProductForEditing --input '{"slug":"air-runner"}'
→ jay-stack action wix-stores/updateProductMainImage --input '{"slug":"air-runner","imageUrl":"https://example.com/red-sneaker.jpg"}'
→ touch src/pages/products/[slug]/page.jay-html  → page reloads with the new image
```

❌ Editing `page.jay-html` to `<img src="https://example.com/red-sneaker.jpg">`. That hard-codes one product's image onto every product page.

## Trade-offs

- **External `url` instead of `importFile` + `_id`:** one API call and one permission. The cost is less control over the Media Manager folder and readiness. Acceptable for dev editing.
- **Guides in `agent-kit/designer/` instead of a dedicated `editing/` folder:** they work on published 0.25.5 today with zero Jay changes. The cost is that they also show up in the designer's "Plugin-Contributed Guides" list. That is mild noise, and arguably useful to the designer agent too.
- **Description pointers duplicate `editingGuide`:** a deliberate bridge until Jay surfaces `editingGuide` in `plugins-index.yaml`. Remove them then.
- **devOnly actions are reachable at `/_jay/actions/*` on the dev server:** anyone who can reach the dev server can mutate the catalog with the configured API key. This is dev-only by design. Production never registers them.

## Follow-ups (Jay framework, public surface)

1. Support `editingGuide` / `readonly` on `dynamic_contracts[]` entries, and include them in the coverage warning.
2. Surface `editingGuide` in `plugins-index.yaml` contract entries.
3. A dev-server API that a devOnly action can call to invalidate the slow-render cache for a contract/route after a source write, replacing the `touch` workaround.

## Agent feedback loop (definition of done)

- **Agent-kit:** the two editing guides *are* the agent-kit contribution. Also add a short "Source editing" section to `agent-kit/designer/store-configuration.md` stating that writes need `apiKeyStrategy` with *Manage Products*.
- **Validation:** Jay's existing source-editing coverage warning (on `main`) covers missing guides for static contracts. No wix-side validator is needed. A future wix-server-client setup check could warn "source editing writes will fail: visitor-only auth", but it is not needed for the demo.

## Verification Criteria

1. Unit: `buildMainImageItems` fixtures and the action request-body fixtures all pass.
2. `npm run build` in `packages/wix-stores` passes `validate-plugin` with no new errors. On jay `main` there is no `source-editing-coverage` warning for the static contracts.
3. On a 0.25.5 project, `agent-kit/plugins-index.yaml` lists the three actions and the `product-page` description pointer, and `agent-kit/designer/INSTRUCTIONS.md` lists both guides.
4. Live: after `updateProductMainImage`, `GET /stores/v3/products/{id}` returns `media.main` = the new image. The dev page shows it after the refresh step.
5. Demo: an AIditor comment "change this image to <url>" on the product image updates the Stores catalog, and the jay-html diff is empty.

## Implementation Results

Phases 1–3 implemented. Phase 4 (live verification + AIditor demo) is pending.

### Files

- `lib/wix-apis/types.ts`: `V3Product.revision`; write types `WritableProductMediaItem`, `ProductUpdate`, `UpdateProductResponse`.
- `lib/wix-apis/update-product.ts` (+ `wix-apis/index.ts` export): `PATCH /stores/v3/products/{id}`, body `{ product: { id, revision, ...patch }, fields? }`, response normalized like the reads.
- `lib/editing/media-items.ts`: `buildMainImageItems`, `isSupportedImageUrl`.
- `lib/editing/editing-actions.ts`: `getProductForEditing` (`makeJayQuery`, no caching), `updateProductMainImage`, `updateProductText` (`makeJayAction`). Exported only from `lib/tools.ts`; `dist/index.js` and `dist/index.client.js` do not contain them.
- `lib/actions/{get-product-for-editing,update-product-main-image,update-product-text}.jay-action`; `plugin.yaml` `actions:` entries with `devOnly: true`; `package.json` exports for the three files (required: `jay-stack` resolves an npm plugin's action metadata through `<package>/<file>.jay-action`).
- `plugin.yaml` contracts: `editingGuide` on `product-search`, `category-products`, `product-spotlight`, and on the `product-page` dynamic contract (forward-compat); `readonly: true` on `category-list`; description pointers on the three static contracts.
- `product-page` description pointer in both `lib/contracts/product-page.jay-contract` and `lib/generators/product-page-contract-generator.ts` (identical text).
- Guides: `agent-kit/designer/wix-stores-editing-product-page.md`, `agent-kit/designer/wix-stores-editing-product-cards.md`; "Source editing" section in `agent-kit/designer/store-configuration.md`; README "Source Editing (dev only)" section.
- Tests: `test/editing/media-items.test.ts`, `test/editing/editing-actions.test.ts`, `test/wix-apis/update-product.test.ts`; fixtures in `test/fixtures/edit-main-image/` and `test/fixtures/editing-actions/` (hand-written from the Catalog V3 REST typings).

### Test results

- `packages/wix-stores`: **67/67** passing (40 existing + 27 new: 11 media-items, 2 update-product, 14 editing-actions).
- `npm run build` passes, including `validate-plugin` ("Plugin validation successful!"). `tsc` clean.
- Registration check in `examples/store` (Jay 0.25.5): `jay-stack-cli action wix-stores/getProductForEditing --input '{}' -v` logs "Loaded metadata … / Registered NPM plugin action" for all three actions from `./tools`. Execution stops at the missing Wix Store service because the example has no Wix credentials, which is expected. No real Wix API was called.

### Deviations from the design

1. **REST field names in the write body.** §2 writes existing items as `{ _id }` (SDK naming). `wixFetch` calls REST directly, and the SDK's `updateProduct` renames `_id` → `id` before sending (`renameKeysFromSDKRequestToRESTRequest` in `@wix/auto_sdk_stores_products-v-3`). So items are sent as `{ id }`, as is `product.id`, which §2 already did.
2. **Existing items keep their `altText`** (`{ id, altText }`). Re-sending only `{ id }` would wipe alt text from the rest of the gallery, because the array is overwritten as a whole. An existing item without an id (not expected) is re-sent by `url`.
3. **Extra error codes**, beyond the three in §3: `INVALID_IMAGE_URL` (imageUrl is neither http(s) nor `wix:image://`, checked before any API call), `NOTHING_TO_UPDATE` (`updateProductText` without `name`/`plainDescription`), `REVISION_CONFLICT` (the single retry also got 409), and `WIX_API_ERROR` (anything else, with status + body).
4. **The read always requests `MEDIA_ITEMS_INFO` + `PLAIN_DESCRIPTION`.** §2 lists only `MEDIA_ITEMS_INFO`. `getProductForEditing` returns the description, and every write path shares one read.
5. **`productId` wins when both `slug` and `productId` are given** (exact key, no slug lookup).
6. **CLI binary.** The guides use `npx jay-stack-cli action wix-stores/<action> --input '<json>'`, not `jay-stack action`. The package's `bin` is a bare path, so the installed command is `jay-stack-cli`, matching the examples' scripts. The `<plugin>/` prefix is not checked by 0.25.5: the action is matched by name suffix.
7. **`.jay-action` optional syntax** is `slug?: string` (the repo's existing form), not `slug: string?` as written in §3.
8. **The "no URL" guidance drops the `uploadMediaFile` route from Q3.** That action takes a multipart file and returns a `fileId`, not a URL, so it cannot be driven through `jay-stack-cli action --input`. The guides offer an http(s) URL or an existing `wix:image://` from the wix-media index.

### Still assumed (verify in Phase 4)

- Wix ingests an external `url` quickly enough that the PATCH response carries `media.main.url` (`mainImageUrl` is `''` otherwise).
- A revision conflict is HTTP 409.
- An mtime-only `touch` of `page.jay-html` clears the 0.25.5 dev slow-render cache.

### Phase 4 — live verification (2026-10-25)

Demo store: a new Wix Headless site from the `commerce` template (Catalog V3, Stores pre-installed), a Jay 0.25.5 project from `create-jay --plugins "Wix Stores"` with this build copied into `node_modules`, `apiKeyStrategy` credentials.

- ✅ `getProductForEditing({slug})` via `npx jay-stack-cli action` returned id, revision and both gallery items.
- ✅ `updateProductMainImage` (direct CLI call, on a scratch product, then restored): PATCH succeeded, revision 1 → 2, and the response already carried `mainImageUrl`.
- ✅ **New finding:** Wix imports an external `url` as a **new** Media Manager file (new id), even when the URL points at a file already in the site's media. Replacing the main with a gallery image therefore leaves that image twice in the gallery (imported copy + original). Follow-up: when `imageUrl` resolves to an existing item (`static.wixstatic.com/media/<id>` or `wix:image://`), reorder that item to the front by `id` instead of importing.
- ✅ **AIditor end-to-end** (`e2e-3-wix-stores-image-20261025.mp4`): comment "Use the lifestyle photo as the main product image: <url>" on the bound product image → the agent followed the product-page guide and updated the Stores catalog (live API: `media.main` changed, revision 1 → 2); project `src/` unchanged. The preview showed the new image while the run was still finishing — consistent with the guide's `touch` refresh step (the dev log does not print cache-clear messages at the default level, so the mechanism is not directly confirmed).
- ⚠️ Still unverified: the revision-conflict status (no conflict occurred).
