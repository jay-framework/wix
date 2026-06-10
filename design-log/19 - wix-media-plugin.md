# Design Log 19: Wix Media Plugin

## Status

Draft

## Background

Jay Framework sites use images and media throughout pages — product images come from Wix APIs, but site-level media (logos, banners, hero images, icons) needs to be managed separately. Currently, media files sit in the project's `public/` directory as static files. This means:

- Media is served from the app's origin, not Wix CDN
- No access to Wix image transformations (resize, crop, quality)
- The AI designer agent has no visibility into what media is available
- No connection between project media and Wix Media Manager

Wix provides `@wix/media` SDK package (files, folders, categories) for managing media programmatically, and `@jay-framework/wix-utils` already has URL formatting/transformation utilities.

## Problem

We need a wix-media plugin that:

1. **Media index for agent-kit** — generates a reference index of all media available in the Wix Media Manager, so the designer agent knows what images/videos exist and can use them when building pages
2. **Upload from public/** — uploads local media files to Wix private media, tracking what's already uploaded to avoid duplicates
3. **Static URL generation** — makes the media index available with ready-to-use static URLs
4. **Usage instructions** — documents how to use Wix media URLs, including transformations from `wix-utils`

## Questions & Answers

Q1: How should the media index be structured? Flat list or organized by folders?
A: Flat list. Folders are used as tagging/metadata on each media item, not as organizational structure in the index. Wix media also has other useful metadata: display name, labels, state (private/public). Private files should be excluded from the index.

Q2: How do we track which local files have already been uploaded to avoid duplicates? Hash-based? Filename-based?
A: Filename-based index file with upload status. Simple and sufficient.

Q3: Should the upload happen during `setup` (like wix-data schema generation) or as a separate CLI command?
A: Separate CLI command. This may require a mechanism for plugins to expose their own CLI commands to `jay-stack-cli`, similar to how actions are exposed. This is potentially a framework requirement.

Q4: What metadata should the index include per media item?
A: Display name, labels, type, dimensions (width/height for images). Plus the derived slug and URL.

Q5: Should the index include media from Wix products/collections, or only site-level media from the Media Manager?
A: Only Media Manager. Other products (stores, CMS) use the same media — their media references are already in their own contracts/data.

Q6: How should the agent reference media — by a human-readable name, by mediaId, or by a ready-to-use URL?
A: By a slug/name derived from the display name. We know slugs aren't unique (only mediaId is), but the index file maps slug → mediaId → URL. The agent uses the slug to find the media, the index resolves it to a URL.

Q7: Should the upload component (headless file upload UI) be in this package?
A: No. The upload component (`@wix/headless-media` provides `FileUploadService`) should be a separate plugin that reuses the media context/service from this package. This package focuses on setup-time tooling (index, bulk upload), not runtime UI.

Q8: Should we handle private/protected file URL generation?
A: Parked for now. Private files with `generateFileDownloadUrl()` (temporary URLs) can be a separate plugin later.

## SDK Analysis

### `@wix/media` package (v1.0.247)

Available on npm, not currently installed. Sub-modules:

- `@wix/auto_sdk_media_files` — file operations (list, import, delete, generate URLs)
- `@wix/auto_sdk_media_folders` — folder management (list, create, move)
- `@wix/auto_sdk_media_enterprise-media-items` — enterprise media items
- `@wix/auto_sdk_media_enterprise-media-categories` — enterprise media categories
- `@wix/headless-media` — headless UI services (gallery, upload components)

### Key API Operations (from Wix docs)

**Files:**

- `listFiles(options?)` — list files in a folder, with pagination
- `importFile(url, options?)` — import file from external URL into Media Manager
- `bulkImportFiles(urls, options?)` — bulk import
- `generateFileDownloadUrl(fileId, options?)` — generate temp download URL
- `generateFilesDownloadUrl(fileIds)` — bulk download URLs (permanent, less secure)
- `deleteFiles(fileIds)` — delete files

**Folders:**

- `listFolders(options?)` — list folders
- `createFolder(name, options?)` — create folder
- Root folders: `MEDIA_ROOT`, `TRASH_ROOT`, `VISITOR_UPLOADS_ROOT`

**Import notes:**

- Import is via URL (not binary upload) — file must be publicly accessible
- Imported files are not immediately available (async processing)
- Triggers events: `FileDescriptorFileReady`, `FileDescriptorFileFailed`

### Existing `@jay-framework/wix-utils` Media Utilities

Already implemented in `packages/wix-utils/lib/media.ts`:

**URL Parsing:**

- `parseWixMediaUrl(url)` → `{ type, mediaId, fileName, originWidth, originHeight, posterUri, ... }`
- Handles: `wix:image://`, `wix:video://`, `wix:document://`, `wix:audio://`

**URL Formatting:**

- `formatWixMediaUrl(id, url, resize?)` → `https://static.wixstatic.com/media/{mediaId}`
- With resize: `https://static.wixstatic.com/media/{mediaId}/v1/fit/w_{w},h_{h},q_90/file.jpg`
- `getVideoPosterUrl(url, resize?)` → poster image URL
- `getDocumentUrl(url)` → `https://static.wixstatic.com/ugd/{mediaId}`
- `getAudioUrl(url)` → `https://static.wixstatic.com/mp3/{mediaId}`

**URL format reference:**

```
Images:  https://static.wixstatic.com/media/{mediaId}
Resized: https://static.wixstatic.com/media/{mediaId}/v1/fit/w_{w},h_{h},q_{q}/file.jpg
Videos:  https://static.wixstatic.com/media/{mediaId}
Docs:    https://static.wixstatic.com/ugd/{mediaId}
Audio:   https://static.wixstatic.com/mp3/{mediaId}
```

## Design

### Overview

The wix-media plugin is a **setup-time and CLI tool**, not a runtime component. It:

1. **Agent-kit reference** (generated during `agent-kit`) — scans Wix Media Manager and generates a flat media index as a reference in agent-kit, like other generated references
2. **Upload CLI command** — uploads local files from `public/` to Wix Media Manager, then regenerates the index
3. Excludes private files from the index

Separate concerns (parked):

- **Upload UI component** (headless file upload) → separate plugin reusing this package's service/context
- **Private file URL generation** → separate plugin

### Media Index (Agent-Kit Output)

Generated at `agent-kit/media/MEDIA-INDEX.md`. Flat list, no folder hierarchy. Folders appear as metadata (labels/tags).

```markdown
# Available Media

| Folder      | Slug        | Display Name | Type  | Dimensions | Labels           | URL                                       |
| ----------- | ----------- | ------------ | ----- | ---------- | ---------------- | ----------------------------------------- |
| Site Assets | logo        | Company Logo | image | 200x80     | branding         | https://static.wixstatic.com/media/abc123 |
| Banners     | hero-banner | Hero Banner  | image | 1920x600   | homepage, banner | https://static.wixstatic.com/media/def456 |
| Videos      | promo-video | Summer Promo | video | 1280x720   | campaign         | https://static.wixstatic.com/media/ghi789 |

## How to Use

### By slug in templates

Find the media by slug in the table above, use the URL in `src` attributes:
`<img src="https://static.wixstatic.com/media/abc123" alt="Company Logo" />`

### Image Transformations

URL format: `https://static.wixstatic.com/media/{mediaId}/v1/{mode}/{params}/file.{ext}`

#### Modes

**fit** — scale to fit within dimensions, preserve aspect ratio (may add padding)
`/v1/fit/w_640,h_480/file.jpg`

**fill** — scale to fill dimensions, crop from center if needed
`/v1/fill/w_640,h_480/file.jpg`

**crop** — extract a rectangle from the original image at specific coordinates
`/v1/crop/x_100,y_50,w_800,h_600/file.jpg`

#### Parameters

- `w_{width}` — target width (1–5000 px)
- `h_{height}` — target height (1–5000 px)
- `x_{x},y_{y}` — crop origin (crop mode only)
- `q_{quality}` — JPEG quality (1–100, default 90)

#### Output formats

Use the file extension to convert:

- `file.jpg` — JPEG (photos, many colors)
- `file.png` — PNG (transparency, simple graphics)
- `file.webp` — WebP (modern, better compression)
- `file.gif` — GIF (animation)

#### Common sizes

- Thumbnail: `/v1/fill/w_100,h_100/file.jpg`
- Card image: `/v1/fill/w_400,h_300/file.jpg`
- Hero: `/v1/fill/w_1920,h_600/file.jpg`
- Full width fit: `/v1/fit/w_1200,h_800/file.webp`

#### Limits

- Max dimension: 5000px per side
- WebP max: 16,383px per side
- Images are not upscaled beyond original size
- Only works with public Wix-hosted media (`static.wixstatic.com`)
```

Slugs are derived from display names (lowercased, hyphenated). Not guaranteed unique — if duplicates exist, append a suffix (e.g., `logo-2`).

Table is sorted by **folder (alphabetically), then slug (alphabetically)** within each folder. This gives visual grouping and keeps the table stable across regenerations.

### Upload Flow (CLI Command)

Exposed as a plugin CLI command (e.g., `jay media upload`):

```
1. Scan public/ for media files (images, videos, documents)
2. Load upload index (config/.wix-media-uploads.json)
3. For each file:
   a. Check if filename exists in upload index
   b. If already uploaded (status: 'ready') → skip
   c. If not uploaded → call importFile(publicUrl) → record as 'pending'
4. Poll/wait for pending files to become ready
5. Update index with final mediaIds and status
6. Rebuild agent-kit media index
```

**Upload index** (`config/.wix-media-uploads.json`):

```json
{
  "public/images/logo.png": { "mediaId": "abc123", "status": "ready" },
  "public/images/banner.jpg": { "mediaId": "def456", "status": "pending" }
}
```

Filename-based tracking — simple, maps local path to Wix mediaId and status.

### Plugin Structure

```
packages/wix-media/
├── lib/
│   ├── index.ts                    # Server exports
│   ├── setup.ts                    # Setup handler (validation)
│   ├── services/
│   │   ├── wix-media-service.ts    # Media Manager API wrapper (list, import)
│   │   └── wix-media-service-marker.ts
│   ├── commands/
│   │   ├── upload-public.ts        # CLI command: upload public/ files to Wix
│   │   └── rebuild-index.ts        # CLI command: rebuild media index
│   ├── contracts/
│   │   ├── upload-public.jay-command   # Command metadata + args schema
│   │   └── rebuild-index.jay-command
│   ├── upload/
│   │   └── upload-index.ts         # Filename-based upload tracking
│   └── index-generator.ts          # Generate MEDIA-INDEX.md and INSTRUCTIONS.md
├── plugin.yaml
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### CLI Commands

Uses the framework's `makeCliCommand` pattern with `.jay-command` metadata files.

#### upload-public.jay-command

```yaml
name: upload-public
description: Upload local public/ files to Wix Media Manager

inputSchema:
  folder?: string # Subfolder of public/ to upload (default: all)
  dryRun?: boolean # List files that would be uploaded without uploading
```

#### rebuild-index.jay-command

```yaml
name: rebuild-index
description: Rebuild agent-kit media index from current Wix Media Manager state
```

#### Command handler example

```typescript
import { makeCliCommand } from '@jay-framework/fullstack-component';
import { WIX_MEDIA_SERVICE } from '../services/wix-media-service-marker';
import { CONSOLE_CONTEXT } from '@jay-framework/stack-server-runtime';

export const uploadPublic = makeCliCommand('upload-public')
  .withServices(WIX_MEDIA_SERVICE, CONSOLE_CONTEXT)
  .withHandler(async (mediaService, console, args) => {
    const { projectRoot, publicFolder } = console;
    // scan publicFolder, upload to Wix, regenerate index
  });
```

#### Invocation

```bash
jay-stack run wix-media/upload-public --folder images --dry-run
jay-stack run wix-media/rebuild-index
```

### plugin.yaml

```yaml
name: wix-media

services:
  - name: wix-media
    marker: WIX_MEDIA_SERVICE
    description: Wix Media Manager API for listing and uploading media

setup:
  handler: setupWixMedia
  references: generateMediaReferences
  description: Validates Wix Media Manager access, generates agent-kit media index

commands:
  - name: upload-public
    command: upload-public.jay-command
  - name: rebuild-index
    command: rebuild-index.jay-command
```

### Agent-Kit Instructions

Generated at `agent-kit/media/INSTRUCTIONS.md`:

```markdown
# Using Media in Jay Framework

## Finding Media

See MEDIA-INDEX.md for all available media with ready-to-use URLs.
Look up media by slug, then use the URL from the table.

## Image URLs

### Basic usage

<img src="https://static.wixstatic.com/media/{mediaId}" alt="description" />

### Transformed (recommended for performance)

URL format: /v1/{mode}/{params}/file.{ext}

#### Modes

- **fit** — scale to fit within dimensions, preserve aspect ratio
  <img src="https://static.wixstatic.com/media/{mediaId}/v1/fit/w_800,h_600/file.jpg" alt="" />
- **fill** — scale to fill dimensions exactly, crop from center
  <img src="https://static.wixstatic.com/media/{mediaId}/v1/fill/w_800,h_600/file.jpg" alt="" />
- **crop** — extract a rectangle at specific coordinates
  <img src="https://static.wixstatic.com/media/{mediaId}/v1/crop/x_100,y_50,w_800,h_600/file.jpg" alt="" />

#### Parameters

- w\_{width} — target width (1–5000 px)
- h\_{height} — target height (1–5000 px)
- x*{x},y*{y} — crop start position (crop mode only)
- q\_{quality} — JPEG quality (1–100)

#### Output format (set via file extension)

- file.jpg — JPEG (photos)
- file.webp — WebP (modern, smaller)
- file.png — PNG (transparency)
- file.gif — GIF (animation)

#### Common sizes

- Thumbnail: /v1/fill/w_100,h_100/file.jpg
- Card: /v1/fill/w_400,h_300/file.jpg
- Hero: /v1/fill/w_1920,h_600/file.jpg
- Full width: /v1/fit/w_1200,h_800/file.webp

## Video

Use the media URL directly in <video> tags.
Poster image: /v1/fit/w*{w},h*{h}/file.jpg appended to video mediaId.

## Documents

URL format: https://static.wixstatic.com/ugd/{mediaId}

## Audio

URL format: https://static.wixstatic.com/mp3/{mediaId}

## Limits

- Max dimension: 5000px per side
- WebP max: 16,383px per side
- Images are not upscaled beyond original size
- Transformations only work with public Wix-hosted media
```

## Implementation Plan

### Phase 1: Package Scaffolding

- Create `packages/wix-media/`
- Add `@wix/media` dependency
- Add `plugin.yaml`, config files

### Phase 2: Media Service

- Implement `WixMediaService` wrapping `@wix/media` files/folders APIs
- List all public files with pagination (filter out private/state checks)
- List folders (for metadata/tagging)
- Slug generation from display names (with dedup suffix)

### Phase 3: Index Generator (agent-kit reference)

- Implement `generateMediaReferences` — the `references` handler in plugin.yaml
- Runs during `jay agent-kit` (not setup) alongside other reference generators
- Scans all public media from Wix Media Manager
- Generates `MEDIA-INDEX.md` with flat table (slug, display name, type, dimensions, labels, folder, URL)
- Generates `INSTRUCTIONS.md` with usage guide and transformation reference
- Output goes to `agent-kit/media/` like other generated references

### Phase 4: CLI Commands

- `upload-public` command — scan `public/`, filename-based tracking via `.wix-media-uploads.json`, import to Wix, regenerate index
- `rebuild-index` command — regenerate agent-kit media index from current Wix Media Manager state
- Uses `makeCliCommand` + `.jay-command` metadata pattern
- Invoked via `jay-stack run wix-media/upload-public`

### Phase 5: Setup Integration

- Wire `setup` handler for validation (check Wix Media Manager access)
- Reference generation happens in agent-kit stage, not setup

### Phase 6: Example Integration

- Add to whisky-exchange or store example
- Upload existing `public/` media to Wix via `jay-stack run wix-media/upload-public`
- Run `jay agent-kit` and verify MEDIA-INDEX.md is generated with correct slugs, URLs, and metadata
- Update existing jay-html templates to use Wix media URLs (with transformations) instead of local `public/` paths
- Verify images render correctly with fit/fill/crop transformations at various sizes

## Trade-offs

| Decision                               | Benefit                                            | Cost                                                     |
| -------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| URL-based import (not binary)          | Uses Wix's importFile API directly                 | Local files need to be publicly accessible during upload |
| Filename-based dedup                   | Simple, easy to inspect and edit                   | Renamed files re-upload                                  |
| Flat index with folder as metadata     | Simple for agent to search, all media in one table | Loses folder hierarchy                                   |
| Slug-based agent references            | Human-readable, agent-friendly                     | Not guaranteed unique, needs suffix dedup                |
| Upload as CLI command (not setup)      | Explicit, controlled, no accidental uploads        | Extra step in workflow                                   |
| Exclude private files                  | Index only has usable media                        | Agent can't reference private media                      |
| Upload UI component in separate plugin | Clean separation: tooling vs runtime               | Two packages to maintain                                 |

---

## Design Revision: Validation-Driven Media

### Motivation

The original design has components pre-formatting URLs with optimization parameters (e.g., `thumbnail_50x50` uses `formatWixMediaUrl(id, url, {w:50, h:50})`). This hides image optimization from the designer agent — the agent sees a `{thumbnail_50x50}` binding and has no control over sizing, quality, or format. It also means every desired size variant needs a dedicated contract tag, which doesn't scale.

Jay Framework 0.18.4 introduces pluggable validation (DL#145). Instead of baking optimization into components, we:

1. Components emit **raw base URLs** — `https://static.wixstatic.com/media/{id}`, no resize params
2. The **designer agent** adds optimization params directly in templates — `{media.url}/v1/fill/w_400,h_300/file.webp`
3. A **validator** catches when optimization is missing, pointing the agent to docs

This gives the designer full control over image sizing per usage context (hero vs. thumbnail vs. card) without needing dedicated contract tags for each.

### Dev-Only Plugin

With the service removed and no runtime components, wix-media becomes a **dev-only plugin**:

- Validator runs during `jay-stack validate`
- MEDIA-INDEX.md generated during `jay-stack agent-kit`
- Upload CLI is a manual dev workflow
- Setup runs during `jay-stack setup`

No `init.ts`, no client bundle, no production footprint. Listed in `devDependencies`.

### Revised Plugin Structure

```
packages/wix-media/
├── lib/
│   ├── index.ts                    # Server exports (setup, commands, validator)
│   ├── setup.ts                    # Setup handler (validation) + reference generation
│   ├── validators/
│   │   └── media-validator.ts      # Jay-HTML validator (DL#145)
│   ├── services/
│   │   └── wix-media-service.ts    # Internal Wix Media Manager API wrapper (used by commands)
│   ├── commands/
│   │   ├── upload-public.ts        # CLI command: upload public/ files to Wix
│   │   └── rebuild-index.ts        # CLI command: rebuild media index
│   └── index-generator.ts          # Generate MEDIA-INDEX.md
├── agent-kit/
│   └── designer/
│       └── wix-media.md            # Designer docs: URL transformations reference
├── plugin.yaml
├── upload-public.jay-command
├── rebuild-index.jay-command
├── package.json
├── tsconfig.json
└── vite.config.ts
```

Removed from original: `init.ts`, `index.client.ts`, service marker exports.

### Revised plugin.yaml

```yaml
name: wix-media

validators:
  - name: media-optimization
    handler: validate
    description: Validates Wix media URLs have optimization parameters

commands:
  - name: upload-public
    command: upload-public.jay-command
  - name: rebuild-index
    command: rebuild-index.jay-command

setup:
  handler: setupWixMedia
  references: generateWixMediaReferences
  description: Validates Wix Media Manager access, generates agent-kit media index
```

No `services:` or `init:` sections.

### Validator Design

#### Implementation

The validator exports `validate: JayHtmlValidatorFn` and uses framework utilities:

- `walkElements`, `resolveBinding` from `@jay-framework/compiler-shared`
- `parseTemplateParts` from `@jay-framework/compiler-jay-html`

It walks all elements, inspecting `src` attributes on `<img>`, `<video>`, `<source>`, and `poster` on `<video>`.

#### Rule A: Hardcoded wix URL without optimization

```html
<!-- ❌ ERROR -->
<img src="https://static.wixstatic.com/media/abc123" />

<!-- ✅ OK -->
<img src="https://static.wixstatic.com/media/abc123/v1/fill/w_400,h_300/file.jpg" />
```

Detection: static template part contains `static.wixstatic.com/media/` but no `/v1/` following the media ID.

Message: `"Wix media URL missing image optimization parameters. See agent-kit/wix-media.md for transformation reference."`

#### Rule B: Binding to wix-image tag without optimization

```html
<!-- ❌ ERROR -->
<img src="{mainMedia.url}" />

<!-- ✅ OK -->
<img src="{mainMedia.url}/v1/fill/w_400,h_300/file.jpg" />
```

Detection: `parseTemplateParts` splits the attribute value → resolve each binding via `resolveBinding` → check if the resolved tag has `meta.mediaType === 'wix-image'` → check whether the static part following the binding contains `/v1/`.

Message: `"Image binding '{path}' produces a Wix media URL but no optimization parameters are applied. See agent-kit/wix-media.md for transformation reference."`

#### Rule C: Local image reference

```html
<!-- ❌ ERROR -->
<img src="/images/logo.png" />
```

Detection: fully static `src` starts with `/` and has an image file extension (jpg, jpeg, png, gif, webp, svg, bmp, ico).

Message: `"Local image reference — upload to Wix Media Manager and use a Wix media URL with optimization parameters. See agent-kit/wix-media.md."`

### Contract Tag Metadata

To enable Rule B, contract tags that produce wix image URLs need `meta: {mediaType: wix-image}`. The validator uses `resolveBinding` to check this metadata at build time.

Example change in `media.jay-contract`:

```yaml
# Before
- { tag: url, type: data, dataType: string, description: Media Url }
- { tag: thumbnail_50x50, type: data, dataType: string, description: Media Thumbnail Url }

# After
- { tag: url, type: data, dataType: string, description: Media Url, meta: { mediaType: wix-image } }
# thumbnail_50x50 removed — designer controls sizing via URL params in template
```

#### Contracts to update

| Package       | Contract                     | Tags getting `meta: {mediaType: wix-image}`                           | Tags removed      |
| ------------- | ---------------------------- | --------------------------------------------------------------------- | ----------------- |
| wix-stores-v1 | media                        | `url`                                                                 | `thumbnail_50x50` |
| wix-stores-v1 | product-card                 | `mainMedia.url`, `thumbnail.url`                                      |                   |
| wix-stores-v1 | category-page                | `media.mainMedia.url`, `media.items.url`, `media.items.thumbnail.url` |                   |
| wix-stores-v1 | category-list                | `imageUrl`                                                            |                   |
| wix-stores    | media                        | `url`                                                                 | `thumbnail_50x50` |
| wix-stores    | (mirror v1 where applicable) |                                                                       |                   |

### Component Changes

Components stop producing pre-optimized URLs. They still convert `wix://` protocol URLs to `https://static.wixstatic.com/media/{id}` base URLs (via `formatWixMediaUrl(id, url)` without resize params).

| Package       | File                          | Change                                                                                        |
| ------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| wix-stores    | components/product-page.ts    | Remove resize params from `formatWixMediaUrl` calls, remove `thumbnail_50x50` from view state |
| wix-stores    | utils/product-mapper.ts       | Remove `{w: 300, h: 300}` resize from `formatWixMediaUrl` call                                |
| wix-stores-v1 | components/product-page.ts    | Remove `thumbnail_50x50` from view state                                                      |
| wix-cart      | contexts/cart-helpers.ts      | No change needed (already no resize)                                                          |
| wix-data      | components/collection-list.ts | No change needed (already no resize)                                                          |

### Example Template Changes

Templates using `{media.thumbnail_50x50}` switch to `{media.url}` with optimization appended:

```html
<!-- Before -->
<img src="{media.thumbnail_50x50}" alt="Product thumbnail" />

<!-- After -->
<img src="{media.url}/v1/fill/w_50,h_50/file.jpg" alt="Product thumbnail" />
```

All `<img src="{...url}">` bindings need optimization params — the validator catches missing ones.

### Revised Trade-offs

| Decision                                    | Benefit                                                    | Cost                                           |
| ------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Validation-driven optimization              | Designer controls sizing per context; no tag proliferation | Agent must learn URL transform syntax          |
| Dev-only plugin                             | Zero production footprint; simpler deployment              | Plugin not available at runtime                |
| Contract tag metadata (`meta.mediaType`)    | Validator detects wix-image bindings at build time         | All image URL tags across packages need `meta` |
| Drop pre-optimized tags (`thumbnail_50x50`) | Fewer tags, designer picks dimensions                      | Breaking change for existing templates         |
| Raw base URLs from components               | Single `url` tag serves all size needs                     | Templates are slightly more verbose            |

### Revised Implementation Plan

#### Phase 1: Validator + Dev-Only Conversion

- Create `lib/validators/media-validator.ts` with Rules A, B, C
- Update `plugin.yaml` — add `validators:`, remove `services:`
- Delete `init.ts`, `index.client.ts`
- Update `index.ts` — export validator, remove service marker
- Simplify `vite.config.ts` — remove client build target
- Update `package.json` — remove `./client` export, add compiler deps

#### Phase 2: Contract Tag Metadata + Drop Tags

- Add `meta: {mediaType: wix-image}` to image URL tags (see table above)
- Remove `thumbnail_50x50` from media contracts
- Regenerate `.jay-contract.d.ts` files

#### Phase 3: Simplify Components

- Remove resize params from `formatWixMediaUrl` calls
- Remove `thumbnail_50x50` from view state construction
- Keep base URL conversion (`wix://` → `static.wixstatic.com`)

#### Phase 4: Update Examples

- Replace `{media.thumbnail_50x50}` with `{media.url}/v1/fill/w_50,h_50/file.jpg`
- Add optimization params to all `<img src="{...url}">` bindings
- Move `@jay-framework/wix-media` to `devDependencies`
- Run `jay-stack validate` to verify

### Tests

Unit tests in `packages/wix-media/test/validators/media-validator.test.ts`. Each test builds a `JayHtmlValidationContext` with a parsed HTML body (via `node-html-parser`'s `parse()`) and a contract with appropriate tags/meta, calls `validate()`, and asserts on findings.

#### Shared test helpers

```typescript
import { parse } from 'node-html-parser';
import { validate } from '../../lib/validators/media-validator.js';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';

function makeContext(
  html: string,
  contract?: JayHtmlValidationContext['contract'],
  headlessImports?: JayHtmlValidationContext['headlessImports'],
): JayHtmlValidationContext {
  return {
    body: parse(html),
    filePath: 'test/page.jay-html',
    projectRoot: '/test',
    contract,
    headlessImports: headlessImports ?? [],
  };
}

// Contract with a wix-image url tag inside a sub-contract
const mediaContract: JayHtmlValidationContext['contract'] = {
  name: 'product-page',
  tags: [
    {
      tag: 'mainMedia',
      type: [4], // sub-contract
      tags: [
        { tag: 'url', type: [1], meta: { mediaType: 'wix-image' } },
        { tag: 'altText', type: [1] },
      ],
    },
    { tag: 'title', type: [1] },
  ],
};
```

#### Rule A: Hardcoded wix URL without optimization

```typescript
it('flags hardcoded wix URL without /v1/ optimization', async () => {
  const ctx = makeContext('<img src="https://static.wixstatic.com/media/abc123" alt="photo" />');
  const findings = await validate(ctx);
  expect(findings).toEqual([
    expect.objectContaining({
      severity: 'error',
      message: expect.stringContaining('optimization parameters'),
      element: expect.stringContaining('img'),
    }),
  ]);
});

it('passes hardcoded wix URL with /v1/ optimization', async () => {
  const ctx = makeContext(
    '<img src="https://static.wixstatic.com/media/abc123/v1/fill/w_400,h_300/file.jpg" alt="photo" />',
  );
  const findings = await validate(ctx);
  expect(findings).toEqual([]);
});
```

#### Rule B: Binding to wix-image tag without optimization

```typescript
it('flags wix-image binding without optimization params in template', async () => {
  const ctx = makeContext('<img src="{mainMedia.url}" alt="product" />', mediaContract);
  const findings = await validate(ctx);
  expect(findings).toEqual([
    expect.objectContaining({
      severity: 'error',
      message: expect.stringContaining('mainMedia.url'),
    }),
  ]);
});

it('passes wix-image binding with optimization params appended', async () => {
  const ctx = makeContext(
    '<img src="{mainMedia.url}/v1/fill/w_400,h_300/file.jpg" alt="product" />',
    mediaContract,
  );
  const findings = await validate(ctx);
  expect(findings).toEqual([]);
});

it('does not flag binding to non-wix-image tag', async () => {
  const ctx = makeContext('<img src="{mainMedia.altText}" alt="product" />', mediaContract);
  const findings = await validate(ctx);
  // altText has no meta.mediaType — not a wix image, no error
  expect(findings).toEqual([]);
});
```

#### Rule C: Local image reference

```typescript
it('flags local /public/ image path', async () => {
  const ctx = makeContext('<img src="/images/logo.png" alt="logo" />');
  const findings = await validate(ctx);
  expect(findings).toEqual([
    expect.objectContaining({
      severity: 'error',
      message: expect.stringContaining('Local image'),
    }),
  ]);
});

it('flags local image with various extensions', async () => {
  const ctx = makeContext('<img src="/banner.webp" alt="banner" />');
  const findings = await validate(ctx);
  expect(findings).toHaveLength(1);
});

it('does not flag non-image local paths', async () => {
  const ctx = makeContext('<a href="/about">About</a>');
  const findings = await validate(ctx);
  expect(findings).toEqual([]);
});
```

#### Edge cases

```typescript
it('handles multiple errors in same file', async () => {
  const ctx = makeContext(
    `<div>
      <img src="https://static.wixstatic.com/media/abc123" alt="a" />
      <img src="/images/logo.png" alt="b" />
      <img src="{mainMedia.url}" alt="c" />
    </div>`,
    mediaContract,
  );
  const findings = await validate(ctx);
  expect(findings).toHaveLength(3);
});

it('checks video poster attribute', async () => {
  const ctx = makeContext(
    '<video poster="https://static.wixstatic.com/media/vid123" src="video.mp4"></video>',
  );
  const findings = await validate(ctx);
  expect(findings).toEqual([
    expect.objectContaining({
      severity: 'error',
      message: expect.stringContaining('optimization parameters'),
    }),
  ]);
});

it('returns no findings for fully optimized page', async () => {
  const ctx = makeContext(
    `<div>
      <img src="{mainMedia.url}/v1/fill/w_800,h_600/file.webp" alt="hero" />
      <img src="https://static.wixstatic.com/media/abc123/v1/fit/w_100,h_100/file.jpg" alt="thumb" />
      <p>No images here</p>
    </div>`,
    mediaContract,
  );
  const findings = await validate(ctx);
  expect(findings).toEqual([]);
});
```

### Framework Issue: Validator handler loading for npm packages

**Problem:** `jay-stack-cli` loads validator handlers incorrectly for npm-published plugins. The validator loading code at `jay-stack-cli/dist/index.js:4277` resolves the handler as a file path relative to the plugin directory:

```js
// Current (broken for npm packages):
const handlerPath = path.resolve(plugin.pluginPath, validatorDef.handler);
const handlerModule = await import(handlerPath);
validatorFn = handlerModule.validate;
```

With `handler: validate` in plugin.yaml and a plugin at `node_modules/@jay-framework/wix-media`, this resolves to `node_modules/@jay-framework/wix-media/validate` — which doesn't exist.

**Expected:** Should match the `loadHandler` pattern used by setup/references handlers in `stack-server-runtime/dist/index.js:2956-2985`:

```js
// For npm packages (plugin.isLocal === false):
const module = await import(plugin.packageName); // e.g. import('@jay-framework/wix-media')
const validatorFn = module[validatorDef.handler]; // e.g. module.validate

// For local plugins (plugin.isLocal === true):
const handlerPath = path.resolve(plugin.pluginPath, validatorDef.handler);
const module = await import(handlerPath);
const validatorFn = module.validate;
```

**Impact:** Plugin validators declared in plugin.yaml with `handler: validate` (an exported function name) work for local plugins but silently fail for npm packages. The error is caught and reported as "Failed to load validator", but in practice the validator just doesn't run.

**Fix location:** `jay-stack-cli`, in the `jay-stack validate` command's validator loading loop. Needs the same local-vs-npm branching that `loadHandler` in `stack-server-runtime` already implements.

**Workaround:** Setting `handler: ./dist/index.js` (a relative file path) works but is fragile and inconsistent with how setup handlers are declared.

### Framework Issue: Validation context doesn't resolve `link:` sub-contracts

**Problem:** The validation context passed to plugin validators contains contracts with unresolved `link:` references. Sub-contract tags with `link: ./media-gallery` have NO `tags` array — only the `link` string. This means `resolveBinding()` and `walkElements()` can't traverse through linked sub-contracts to reach nested tags.

**Example:** `product-page` contract has:

```
mediaGallery (link: ./media-gallery)
  └→ selectedMedia (link: ./media)
       └→ url (meta: {mediaType: wix-image})  ← validator can't reach this
```

Binding `{productPage.mediaGallery.selectedMedia.url}` — the validator resolves `mediaGallery` but finds `link: './media-gallery'` with no `tags`, so it stops. The `meta: {mediaType: wix-image}` on the `url` tag is invisible.

**Where it works correctly:** The tag coverage analysis in `jay-stack validate` DOES resolve links (it reports all 55 tags including linked ones). The `resolveHeadlessInstances` function at `compiler-jay-html:29864-29876` also resolves links using `loadLinkedContract()`. Only the validation context construction skips link resolution.

**Fix location:** `jay-stack-cli`, validation context construction at line 4310-4324. Before passing `parsed.contract` and `parsed.headlessImports[].contract` to validators, resolve all `link:` references inline using `loadLinkedContract()` — replacing `link:` with the linked contract's `tags`. The `importResolver` is available in the validation code path.

**Impact:** Rule B (binding to wix-image tag) only works for contracts with inline `tags`. Contracts connected via `link:` (which is the common case for wix-stores media) are invisible to validators. Rules A and C (static URL / local image) work fine since they don't depend on contract resolution.

### Verification Criteria

1. `packages/wix-media` builds (server only, no client)
2. `packages/wix-stores-v1` and `packages/wix-stores` build with updated contracts
3. All validator tests pass — rules A, B, C each have positive and negative cases
4. `jay-stack validate` on examples flags unoptimized URLs, passes optimized ones
5. wix-media is in `devDependencies` only — not in production bundle
6. No `thumbnail_50x50` references remain in contracts or components
