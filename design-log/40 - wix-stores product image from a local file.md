# 40 — wix-stores: replace a product image (main or gallery item) from a local file

Status: **[Implemented]** — approved at design review, then revised in scope (any gallery item, not only the main image) before implementation started. Extends DL #38 (source editing actions); DL #38's design section is not rewritten.

## Decisions for the Implementer (TL;DR)

1. **`updateProductMainImage` is replaced by `updateProductImage({ slug | productId, mediaId?, imageUrl | imageFile, altText?, keepPrevious? })`.** No backward-compatibility alias: DL #38 is unreleased.
   - **With `mediaId`** (a Wix product media item `_id`) → that gallery item is replaced **in place** (same position). If it is the first item, the new image is the new main (Wix's main is the first item).
   - **Without `mediaId`** → the main (first) item is replaced, exactly as DL #38's `updateProductMainImage` did.
   - Unknown `mediaId` → `MEDIA_ITEM_NOT_FOUND` (lists the product's item ids), before any write.
2. **`imageFile`** — a local file path; absolute (what the AIditor lists), or relative to `process.cwd()` — the project root, since the guides run `jay-stack-cli action` from there. Exactly one of `imageUrl` / `imageFile` is required (`IMAGE_SOURCE_REQUIRED`).
3. **Upload through Wix Media, then reference by id:** `generate-upload-url` → `PUT` the bytes → find the uploaded file's id by listing the folder by `displayName` (as wix-media does) → wait until the file is **READY** → synthesize `wix:image://v1/<fileId>/<encodeURIComponent(fileName)>` and pass it as the image URL into the item builder. Same upload calls wix-media already uses (`wix-media-service.ts:313-327`), called directly via `wixFetch` so wix-stores does not depend on wix-media.
4. **Upload into a fixed Media Manager folder** named `media` at the Media Manager root (created on first use).
5. **Images only, ≤ 10 MB** (jpg / jpeg / png / webp / gif). Larger files need Wix's resumable upload API — out of scope; clear error instead.
6. **Guides decide `mediaId`:** product-page thumbnail (inside the `availableMedia` forEach) → the forEach **item id** (trackBy `mediaId`); the displayed large image (`selectedMedia.url`, which carries no identity) → match its displayed `src` (from the AIditor prompt's Target source line) against `getProductForEditing` media item ids; product cards → no `mediaId` (main). Descriptions/names → `updateProductText` (unchanged).
7. **Credentials:** the API key also needs Media Manager permissions (folders + `MEDIA.SITE_MEDIA_FILES_UPLOAD`). A 401/403 on **any** Media call (folder list/create, upload URL, file list/get) → `MEDIA_UPLOAD_NOT_AUTHORIZED` with that instruction.

## Background

DL #38 shipped `updateProductMainImage({ slug | productId, imageUrl, altText?, keepPrevious? })`, live-verified with an image URL (Wix imports the URL as a new Media Manager file). The AIditor lets users attach files to a comment; the file lands on disk under `build/aditor/…` and its path is listed in the agent prompt. The editing agent's prompt is expected to give it the attachment's path and, for the marked element, its source location plus its rendered `src` (a "Target source … shows src" line); the guides below rely only on that.

The product page shows a large image bound to `productPage.mediaGallery.selectedMedia.url` and thumbnails from `availableMedia` (forEach, `trackBy: mediaId`; `mediaId` = the Wix media item `_id`, `lib/components/product-page.ts:227-251`). Clicking a thumbnail changes `selectedMedia` — the large image then shows that gallery item, not the main one. Both render through `formatWixMediaUrl` (`wix-utils/lib/media.ts:109`), so the displayed `src` is `https://static.wixstatic.com/media/<item _id>` (plus an optional resize suffix).

## Problem

1. The natural comment is **"replace this image"** + a photo from the user's computer. The photo has no public URL, so `imageUrl` cannot carry it. wix-media's `upload-public` command uploads a whole `public/` folder in batch and its `uploadMediaFile` action takes a multipart upload — neither fits "this one file, for this product", and neither can be driven by `jay-stack-cli action --input <json>`.
2. "Replace this image" is not always the main image: the user may have clicked a thumbnail (the large image now shows gallery item N), or may comment on a thumbnail directly. A main-image-only action would replace the wrong image.

## Prior Art / Adjacent Mechanisms

| Mechanism | Verdict |
| --- | --- |
| wix-media `uploadPublicFile` (`lib/services/wix-media-service.ts:306-328`): `files.generateFileUploadUrl(mimeType, { fileName, parentFolderId })` → `PUT` bytes with `Content-Type` | **Reuse the call sequence**, reimplemented via `wixFetch` (REST, like `lib/wix-apis/*` — no new `@wix/media` dependency in wix-stores). |
| DL #38 `updateProductMainImage` + `buildMainImageItems` + read-revision-then-PATCH with one 409 retry | **Generalize.** The action becomes `updateProductImage`; `buildMainImageItems` becomes `buildReplacedImageItems(existing, imageUrl, { mediaId?, altText?, keepPrevious? })`. Without `mediaId` it returns exactly what `buildMainImageItems` returned (existing fixtures keep passing). `toNewMainItem` already turns a `wix:image://` URL into `{ id }` via `parseWixMediaUrl` (`lib/editing/media-items.ts:30-34`). |
| wix-media `findPublicFileInParentFolder` (`wix-media-service.ts:331`): resolves the uploaded file by `displayName` in its folder instead of reading the `PUT` response | **Reuse the strategy** as the id resolution. |
| `getProductForEditing` (DL #38) returns `media.items[].{id,url}` | **Reuse** — the guide's way to map a displayed `src` to a `mediaId`. |
| wix-media `upload-public` command / `uploadMediaFile` action | Rejected for this case (batch / multipart; see Problem). |

## Questions and Answers

**Q1. Upload folder: `Source editing` folder vs. Media Manager root?** Proposed: a dedicated folder (easy cleanup, clear provenance).
**A:** Settled — a dedicated folder at the Media Manager root named **`media`**. These are ordinary site images used by Stores, so the name should be what a site editor expects, not a feature label like `Source editing`.
**Q2. Replace vs. keep the old main?** Unchanged from DL #38: replace by default, `keepPrevious: true` prepends. The guide keeps telling the agent to use the default for "replace".
**A (revision):** `keepPrevious` now applies to whichever item is replaced: the new image is inserted at that item's position and the old one is kept right after it.
**Q3. Wait for readiness, or reference the file immediately?** Wait (poll), because Wix documents that an uploaded file "is not immediately available". Whether a product can reference a still-processing file is unverified; polling avoids the question.
**Q4. A second action (`updateProductGalleryImage`) or one action with `mediaId?`** *(scope revision after product review)*
**A:** One action. Main is just "the first item"; a separate action would duplicate the upload, validation and revision-retry path. Renamed to `updateProductImage` because it is no longer main-only.
**Q5. How does the agent know which gallery item the large image shows?** `selectedMedia` has no id in the markup.
**A:** From the rendered `src`. The AIditor adds `shows src "…"` to the Target source line; the URL contains the item `_id` (`https://static.wixstatic.com/media/<_id>…`). The guide tells the agent to run `getProductForEditing` and pick the item whose `id` appears in that `src` (or whose `url` equals it). If none matches, ask the user — do not guess the main.
**Q6. Thumbnail comment — item id or src?** The thumbnail sits inside the `availableMedia` forEach, and the Target source line already says `inside forEach … item "<mediaId>"` — that is the `mediaId` directly.

## Design

### Action

```yaml
# lib/actions/update-product-image.jay-action  (replaces update-product-main-image.jay-action)
name: updateProductImage
inputSchema:
  slug?: string
  productId?: string
  mediaId?: string       # product media item _id to replace; omitted → the main (first) item
  imageUrl?: string      # public http(s) URL or wix:image:// Media Manager URL
  imageFile?: string     # local image path; absolute or relative to the project root
  altText?: string
  keepPrevious?: boolean
outputSchema:
  productId: string
  slug: string
  revision: string
  mainImageUrl: string
  imageUrl: string            # the new item's URL as returned by Wix
  replacedMediaId: string     # the item that was replaced ('' when the product had no media)
  uploadedFileId?: string     # only for imageFile
```

`plugin.yaml` action entry, `package.json` export, `tools.ts` export and the README are renamed accordingly.

**Rename blast radius:** action id `'wixStores.updateProductMainImage'` → `'wixStores.updateProductImage'` (`editing-actions.ts:50`); `UpdateProductMainImageInput/Output` → `UpdateProductImageInput/Output` (generated `.jay-action.d.ts`); `update-product-main-image.jay-action` file; `plugin.yaml` entry; `package.json` export; `tools.ts` export; README table + example; both guides; `store-configuration.md` mention; tests (`editing-actions.test.ts`) and fixtures renamed `update-image-*`. In `media-items.ts`: `MainImageOptions` → `ReplaceImageOptions` (adds `mediaId`), header comment updated; the four existing `buildMainImageItems` tests (replace, keepPrevious, wix:image, no media) run unchanged against `buildReplacedImageItems` without `mediaId` — same fixtures, same expected output.

**Output:** `mainImageUrl` = the product's main image after the write (unchanged when a non-main item was replaced); `imageUrl` = the URL Wix returns for the new item (at the replaced position); `replacedMediaId`; `uploadedFileId` for `imageFile`.

Validation, before any API call: identity (`MISSING_PRODUCT_IDENTITY`); exactly one of `imageUrl` / `imageFile` (`IMAGE_SOURCE_REQUIRED`); `imageUrl` → `INVALID_IMAGE_URL` as today; `imageFile` → exists (`FILE_NOT_FOUND`), extension (lower-cased, so `.JPG` is accepted; no content sniffing) jpg/jpeg/png/webp/gif (`UNSUPPORTED_FILE_TYPE`), size ≤ 10 MB (`FILE_TOO_LARGE`). `mediaId` is checked against the product as read (`MEDIA_ITEM_NOT_FOUND`), before the upload — the product is read once for this check **only when `mediaId` is given**, then again inside the revision-retry write (cheap, and keeps the write path unchanged). A replaced item's old `altText` is not carried over (pass `altText` to set one). Replacing a video item with an image is allowed (the guide only targets images).

### Item building (`lib/editing/media-items.ts`)

```
buildReplacedImageItems(existing, imageUrl, { mediaId?, altText?, keepPrevious? })
  index = mediaId ? existing.findIndex(item._id === mediaId) : 0      (-1 → throws MEDIA_ITEM_NOT_FOUND)
  newItem = toNewItem(imageUrl, altText)
  result  = existing[0..index) + newItem + (keepPrevious ? existing[index] : nothing) + existing(index..]
  every existing item re-sent as { id } (or { url } without id), with its altText
```

Empty gallery: `[newItem]` (mediaId must be absent; with a mediaId it is `MEDIA_ITEM_NOT_FOUND`).

The lookup runs inside `buildPatch` on `current` (the product as read for that write attempt), so a 409 retry re-finds the index; an item deleted between reads raises `MEDIA_ITEM_NOT_FOUND`, never a write at index -1. The pre-upload read only validates.

### API sequence (imageFile)

```
1. Folder:  GET /site-media/v1/folders?parentFolderId=media-root → the folder with displayName "media"
            (root-level only, so a nested "media" is never picked); none → POST /site-media/v1/folders
            { displayName: "media", parentFolderId: "media-root" }
2. Upload:  POST /site-media/v1/files/generate-upload-url
              { mimeType, fileName: <basename>, parentFolderId, sizeInBytes }
            → { uploadUrl }
            PUT <uploadUrl>  (Content-Type: mimeType, body: file bytes)
3. Resolve: GET /site-media/v1/files?parentFolderId=<folderId>&paging.limit=100 (follow nextCursor),
            keep state = OK and displayName = <fileName>; several → newest createdDate → fileId.
            None → MEDIA_UPLOAD_FAILED. Wix keeps the exact displayName (spike); a repeated upload of the
            same name is disambiguated by newest createdDate. (The PUT response body is not relied on.)
4. Ready:   GET /site-media/v1/files/get-file-by-id?fileId=<id> until file.operationStatus = READY
            (≤ 30 s, 1 s interval); timeout → MEDIA_FILE_NOT_READY; FAILED → MEDIA_UPLOAD_FAILED
5. Product: read product (revision, media items)
            → items = buildReplacedImageItems(existing, `wix:image://v1/${fileId}/${encodeURIComponent(fileName)}`, { mediaId, altText, keepPrevious })
            → PATCH /stores/v3/products/{id}  (DL #38 path; one 409 retry)
```

**Handler shape** (`editing-actions.ts`): validate input → read product, resolve the target index (`MEDIA_ITEM_NOT_FOUND`) → if `imageFile`, upload it and build the synthetic URL → write via `writeWithRevisionRetry` with `buildReplacedImageItems`. The name segment of the synthetic URL is `encodeURIComponent(fileName)`, matching the `decodeURIComponent` in `parseWixMediaUrl` (`wix-utils/lib/media.ts:57`).

| Claim | Status |
| --- | --- |
| `generate-upload-url` is `POST` on `site-media/v1` (`/v1/files/generate-upload-url`) with `mimeType` (required), `fileName`, `sizeInBytes`, `parentFolderId`, `private` | ✅ `@wix/auto_sdk_media_files` `build/cjs/index.js:510-529`, `index.typings.d.ts:973-1000` |
| Permission `MEDIA.SITE_MEDIA_FILES_UPLOAD` | ✅ same typings, JSDoc of `generateFileUploadUrl` |
| Uploaded file is not immediately usable; > 10 MB should use the resumable URL | ✅ same JSDoc (`generateFileUploadUrl`: "for files larger than 10MB use generateFileResumableUploadUrl") |
| MIME type from the extension: jpg/jpeg → `image/jpeg`, png → `image/png`, webp → `image/webp`, gif → `image/gif` | unit-tested |
| Upload is a `PUT` of the raw bytes with `Content-Type` | ✅ wix-media `wix-media-service.ts:322-326` (in production use) |
| The uploaded file can be found in its folder by `displayName` | ✅ wix-media `findPublicFileInParentFolder` (`wix-media-service.ts:331`, in production use) |
| Product media item `_id` = Media Manager file id; re-sending `{ id }` keeps an item | ✅ DL #38 live run (`toExistingItem` re-sends by id) |
| The displayed `src` of `selectedMedia` / thumbnails identifies the item | ✅ `product-page.ts:237-245` → `formatWixMediaUrl(_id, url)` (`wix-utils/lib/media.ts:117-131`): for `wix:` URLs (or no URL) it is `https://static.wixstatic.com/media/<_id>`; for an `http(s)` item URL it is that stored URL (resize stripped). Hence the guide's rule: the item whose `id` appears in the src **or** whose `url` equals it. |
| `generateFileUploadUrl` works with an **API key** | ✅ live spike 2026-10-26 on the demo store (200, upload URL returned, PUT 200) |
| Folder list/create and file list/get-by-id paths and shapes | ✅ live spike 2026-10-26 (`GET /v1/folders?parentFolderId=media-root`, `POST /v1/folders`, `GET /v1/files?parentFolderId=`, `GET /v1/files/get-file-by-id?fileId=` → `file.operationStatus: READY`); paths match `@wix/auto_sdk_media_folders` / `_files` `build/cjs/index.js` |

### Guide changes (product-page and product-cards guides)

Product page — bound-field table:

| Element | `mediaId` |
| --- | --- |
| a thumbnail (`availableMedia[].media.url`, inside the forEach) | the forEach **item id** from the Target source line |
| the large image (`mediaGallery.selectedMedia.url`) | run `getProductForEditing`; the item whose `id` appears in the Target source `shows src "…"` (it may not be the main — the user may have clicked a thumbnail). No match → ask the user. |

> **The user attached an image** ("replace this image", "use this photo") → it is the new value of that image. Run `npx jay-stack-cli action wix-stores/updateProductImage --input '{"slug":"…","mediaId":"…","imageFile":"<attachment path from the prompt>"}'`, then the refresh step. Do not copy the file into `public/` and do not edit the jay-html.

Product cards: `mainMedia.url` → `updateProductImage` without `mediaId` (the main image). Both guides: name / description → `updateProductText`; the "No image URL?" section now offers `imageFile` for an attached file.

## Implementation Plan

1. **Phase 1 — upload client (TDD):** `lib/wix-apis/upload-media-file.ts` (folder find/create, generate URL, PUT, find by `displayName`, readiness poll) with mocked `wixFetch` / `fetch`; fixtures for request paths + bodies (`toEqual`), poll timeout, 401/403 mapping, MIME mapping. **Live spike** (API key → folder → generate URL → PUT → find → READY) — done before implementation, see claims table.
2. **Phase 2 — items + action:** `buildReplacedImageItems` with hand-written fixtures (replace first, replace middle, replace last, keepPrevious at middle, unknown id); rename the action to `updateProductImage` (`.jay-action`, `plugin.yaml`, `package.json`, `tools.ts`), add `mediaId` / `imageFile` + validations; tests for the exactly-one rule, each error code, and the upload → synthetic URL → PATCH request sequence.
3. **Phase 3 — guides + README.** `npm run build` (incl. `validate-plugin`), all tests green.
4. **Phase 4 — live:** CLI call with a local JPEG on the demo store, with and without `mediaId` → the right item replaced; then the AIditor demo.

## Examples

✅ `updateProductImage({ slug: "baseball-cap", imageFile: "/…/build/aditor/…/cap-back.jpeg" })` → uploads to `media/cap-back.jpeg`, sets it as MAIN; gallery = [new, …rest].
✅ User clicked the 2nd thumbnail, comments on the large image: Target source `… (img), shows src "https://static.wixstatic.com/media/c837a6_b2~mv2.jpg"` → `getProductForEditing` → item `c837a6_b2~mv2.jpg` → `updateProductImage({ slug, mediaId: "c837a6_b2~mv2.jpg", imageFile })` → gallery = [main, new, …rest]; main unchanged.
✅ Comment on the 3rd thumbnail: `inside forEach @40-44 item "c837a6_c3~mv2.jpg"` → `mediaId: "c837a6_c3~mv2.jpg"`.
❌ Replacing the main image after the user clicked a thumbnail and said "replace this image".
❌ Copying the attachment into `public/` and setting `src="/cap-back.jpeg"` in the product template.

## Trade-offs

- **Duplicate upload code with wix-media** (≈30 lines) instead of a cross-plugin dependency — keeps wix-stores installable without wix-media.
- **Polling for readiness** adds a few seconds per write; avoids referencing an unprocessed file.
- **No resumable upload:** files > 10 MB fail with a clear error.
- **Large-image identity via the `src` match** is agent-side, not deterministic; it depends on the src containing the media id (true for every URL `formatWixMediaUrl` produces). The guide says to ask the user when nothing matches.
- **Same-name concurrent uploads:** the newest-`createdDate` tie-break could pick another upload of the same name finishing at the same moment — acceptable for a dev-only tool.
- **Extra read** for the `mediaId` check before upload — avoids uploading a file for a write that would fail.

## Verification Criteria

1. Unit: upload request fixtures, readiness poll, error codes, exactly-one validation, item building at first/middle/last position — all pass; existing tests stay green (renamed).
2. Live: after the CLI call, `GET /stores/v3/products/slug/{slug}` → the target item (main or `mediaId`'s position) is `uploadedFileId`, other items unchanged; the file is in Media Manager → `media`.
3. Demo: AIditor (a) comment on the large image "replace this image" + file → MAIN replaced; (b) click 2nd thumbnail, comment on the large image + file → that item replaced, main unchanged; (c) comment on the description → `updateProductText`; jay-html diff empty; dashboard shows the results.

## jay-feedback impact

- **Agent-kit:** yes — the two wix-stores editing guides (Phase 3).
- **Validation:** none — which gallery item the user meant is not knowable at build time.

## Implementation Results (2026-10-26)

**Files:** `lib/wix-apis/upload-media-file.ts` (new), `lib/editing/image-file.ts` (new — path resolution, type/size checks, MIME map), `lib/editing/media-items.ts` (`buildReplacedImageItems`, `indexOfReplacedItem`), `lib/editing/editing-actions.ts` (`updateProductImage`), `lib/actions/update-product-image.jay-action` (renamed), `plugin.yaml`, `package.json`, `lib/tools.ts`, README, the two editing guides, `store-configuration.md`.

**Phase 1 live spike** (before code, demo store, API key from `config/.wix.yaml`): root `media` folder created, `generate-upload-url` 200, `PUT` 200, file listed by exact `displayName`, `get-file-by-id` → `operationStatus: READY` within the first poll. The spike left one `spike-<timestamp>.jpeg` in Media Manager → `media`.

**Deviations from the Design**
1. The readiness call is `GET /site-media/v1/files/get-file-by-id?fileId=` (the first draft said `/files/{fileId}`; corrected in the Design before implementation, from the spike). Query strings are built with `URLSearchParams` (so `~` in ids is sent as `%7E`; accepted by Wix).
2. `MEDIA_ITEM_NOT_FOUND` is thrown from `indexOfReplacedItem` (`media-items.ts`) — used both by the pre-upload check and inside `buildPatch` — rather than by the handler.
3. Upload/processing failures are a typed `MediaUploadError` (`MEDIA_UPLOAD_FAILED` / `MEDIA_FILE_NOT_READY`) in the REST layer; the handler maps it, and 401/403 on any Media call, to the `ActionError` codes.
4. The 409-retry test gets its own expected output (`expected-update-image-retry-output.json`): after the conflict the re-read product's main is a different item, so `replacedMediaId` is that item — the correct behavior per "lookup runs on `current`".

**Tests:** wix-stores 91/91 (was 67 + new: 4 item-builder, 8 upload client, 12 action cases). `npm run build` incl. `validate-plugin` ✅. Root `yarn wsrun -t test`: 26/27 workspaces pass; `@jay-framework/wix-server-client` fails with `command not found: vitest` (environment, untouched package). Root `yarn build` fails in untouched `wix-deploy` (`lib/artifact-store.ts` imports `production-server/serve` members missing from the installed jay 0.25.5) — pre-existing, unrelated.

**Live (Phase 4, CLI on the demo store, Baseball Cap):** `updateProductImage({ slug, mediaId: <3rd item>, imageFile })` → uploaded `a73159_d498…~mv2.jpeg`, gallery = [main, item 2, new] (main + item 2 unchanged), `replacedMediaId` = the 3rd item; restored with `imageUrl: "wix:image://v1/<original id>/cap.jpg"` + `mediaId` → original gallery back. AIditor demo: recorded 2026-10-26 with real agent runs (main image, 2nd gallery item, description), all three verified in the Wix dashboard; see Demo follow-up below.

**jay-feedback:** agent-kit — yes, the two wix-stores editing guides (which image → `mediaId`; attachment → `imageFile`; no copy into `public/`). Validation — none (which gallery image the user meant is runtime context).

### Demo follow-up (2026-10-26)

Recording scenario 2 (click thumbnail 2, "replace this image" + photo), one real agent run picked the right `mediaId` but added `"keepPrevious":true` on its own, so it inserted the photo instead of replacing. The guides said keepPrevious was optional but never said that "replace" means leaving it out (Q2's intent). **Fix (agent-kit):** both guides now say *"Replace this image" means replace: do not pass `keepPrevious`; only pass it when the user explicitly asks to keep the old image.* On the re-recorded run the agent replaced item 2 in place. wix-stores tests 91/91 and the build with validate-plugin are unchanged.
