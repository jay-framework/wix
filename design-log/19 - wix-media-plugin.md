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

1. Scans Wix Media Manager and builds a flat media index for agent-kit
2. Uploads local files from `public/` to Wix Media Manager via a CLI command
3. Generates agent-kit reference files with slug-based media lookup and usage instructions
4. Excludes private files from the index

Separate concerns (parked):
- **Upload UI component** (headless file upload) → separate plugin reusing this package's service/context
- **Private file URL generation** → separate plugin

### Media Index (Agent-Kit Output)

Generated at `agent-kit/media/MEDIA-INDEX.md`. Flat list, no folder hierarchy. Folders appear as metadata (labels/tags).

```markdown
# Available Media

| Slug | Display Name | Type | Dimensions | Labels | Folder | URL |
|------|-------------|------|-----------|--------|--------|-----|
| logo | Company Logo | image | 200x80 | branding | Site Assets | https://static.wixstatic.com/media/abc123 |
| hero-banner | Hero Banner | image | 1920x600 | homepage, banner | Banners | https://static.wixstatic.com/media/def456 |
| promo-video | Summer Promo | video | 1280x720 | campaign | Videos | https://static.wixstatic.com/media/ghi789 |

## How to Use

### By slug in templates
Find the media by slug in the table above, use the URL in `src` attributes:
`<img src="https://static.wixstatic.com/media/abc123" alt="Company Logo" />`

### Resized (recommended for performance)
Append resize parameters:
`https://static.wixstatic.com/media/{mediaId}/v1/fit/w_{width},h_{height},q_90/file.jpg`

### Common sizes
- Thumbnail: `/v1/fit/w_100,h_100,q_90/file.jpg`
- Card image: `/v1/fit/w_400,h_300,q_90/file.jpg`
- Hero: `/v1/fit/w_1920,h_600,q_90/file.jpg`

### Resize modes
- `/v1/fit/` — fit within bounds, preserve aspect ratio
- `/v1/fill/` — fill bounds, crop if needed

### Quality
- `q_90` — high quality (default)
- `q_75` — balanced
- `q_50` — compressed (thumbnails, previews)
```

Slugs are derived from display names (lowercased, hyphenated). Not guaranteed unique — if duplicates exist, append a suffix (e.g., `logo-2`).

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

### Framework Requirement: Plugin CLI Commands

Plugins need a way to expose CLI commands to `jay-stack-cli`, similar to how actions are exposed. For example:

```yaml
# plugin.yaml
commands:
  - name: media:upload
    handler: uploadMedia
    description: Upload local public/ files to Wix Media Manager
  - name: media:index
    handler: generateIndex
    description: Rebuild media index from Wix Media Manager
```

This allows `jay media:upload` and `jay media:index` from the CLI.

### Plugin Structure

```
packages/wix-media/
├── lib/
│   ├── index.ts                    # Server exports
│   ├── setup.ts                    # Setup handler (index generation for agent-kit)
│   ├── services/
│   │   ├── wix-media-service.ts    # Media Manager API wrapper (list, import)
│   │   └── wix-media-service-marker.ts
│   ├── commands/
│   │   ├── upload.ts               # CLI: upload public/ files to Wix
│   │   └── index.ts                # CLI: rebuild media index
│   ├── upload/
│   │   └── upload-index.ts         # Filename-based upload tracking
│   └── index-generator.ts          # Generate MEDIA-INDEX.md and INSTRUCTIONS.md
├── plugin.yaml
├── package.json
├── tsconfig.json
└── vite.config.ts
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
  description: Scans Wix Media Manager, generates agent-kit media index

# CLI commands (framework requirement — plugin-exposed commands)
commands:
  - name: media:upload
    handler: uploadMedia
    description: Upload local public/ files to Wix Media Manager
  - name: media:index
    handler: generateIndex
    description: Rebuild media index from Wix Media Manager
```

### Agent-Kit Instructions

Generated at `agent-kit/media/INSTRUCTIONS.md`:

```markdown
# Using Media in Jay Framework

## Finding Media
See MEDIA-INDEX.md for all available media with ready-to-use URLs.

## Image URLs

### Basic usage
<img src="https://static.wixstatic.com/media/{mediaId}" alt="description" />

### Resized (recommended)
<img src="https://static.wixstatic.com/media/{mediaId}/v1/fit/w_800,h_600,q_90/file.jpg" />

### Common sizes
- Thumbnail: w_100,h_100
- Card: w_400,h_300
- Hero: w_1920,h_600
- Full width: w_1200,h_auto (use originWidth from index)

### Resize modes
- `/v1/fit/` — fit within bounds, preserve aspect ratio (letterbox)
- `/v1/fill/` — fill bounds, crop if needed

### Quality
- q_90 — high quality (default)
- q_75 — balanced
- q_50 — compressed (thumbnails, previews)

## Video
Use the media URL directly in <video> tags.
Poster image: append /v1/fit/w_{w},h_{h},q_90/file.jpg to video mediaId.

## Documents
URL format: https://static.wixstatic.com/ugd/{mediaId}

## Audio
URL format: https://static.wixstatic.com/mp3/{mediaId}
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

### Phase 3: Index Generator
- Scan all public media from Wix Media Manager
- Generate `MEDIA-INDEX.md` with flat table (slug, display name, type, dimensions, labels, folder, URL)
- Generate `INSTRUCTIONS.md` with usage guide and transformation reference

### Phase 4: CLI Commands
- `media:upload` — scan `public/`, filename-based tracking via `.wix-media-uploads.json`, import to Wix
- `media:index` — rebuild media index from current Wix Media Manager state
- Framework requirement: plugin CLI command registration mechanism

### Phase 5: Setup Integration
- Wire `setup` handler to generate agent-kit references on `jay setup`
- Index generation runs during setup (read-only, no upload)

## Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| URL-based import (not binary) | Uses Wix's importFile API directly | Local files need to be publicly accessible during upload |
| Filename-based dedup | Simple, easy to inspect and edit | Renamed files re-upload |
| Flat index with folder as metadata | Simple for agent to search, all media in one table | Loses folder hierarchy |
| Slug-based agent references | Human-readable, agent-friendly | Not guaranteed unique, needs suffix dedup |
| Upload as CLI command (not setup) | Explicit, controlled, no accidental uploads | Extra step in workflow |
| Exclude private files | Index only has usable media | Agent can't reference private media |
| Upload UI component in separate plugin | Clean separation: tooling vs runtime | Two packages to maintain |
