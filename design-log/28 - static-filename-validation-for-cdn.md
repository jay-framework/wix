# Design Log #28 — Static Filename Validation for CDN

## Background

When `wix-deploy` uploads frontend files to Wix CDN, filenames with spaces break. The CDN redirects spaces to hyphens — so a file uploaded as `/Jay Logo 2.png` becomes `/Jay-Logo-2.png`, but the HTML still references `/Jay Logo 2.png`. Result: broken images on the deployed site.

The same issue manifests locally when using the generated `serve.mjs` (the server resolves paths correctly, but it indicates the site won't work once deployed).

### Related

- Wix DL#19 — Wix Media Plugin
- Wix DL#22 — Wix Deploy Pipeline

## Problem

No validation catches this before deploy. The user deploys, sees broken images, and has to debug the CDN path mismatch manually.

When `wix-media` is installed, images get uploaded to Wix Media Manager and served from `wixstatic.com` with proper optimization — the CDN filename issue doesn't apply. But for projects without `wix-media`, local images go straight to CDN as static files.

## Design

Add a jay-html validator to `wix-deploy` that flags local image paths containing spaces.

### Validator behavior

1. Walk `<img>`, `<video>`, `<source>` elements for `src` attributes, and `<link>` elements for `href`
2. For fully static values (no bindings): check if it's a local path (not `http://`, `https://`, or a data URL)
3. If the path contains a space → report an error
4. Skip entirely if `@jay-framework/wix-media` is installed — those images will be served from Wix Media Manager, not the CDN

### Error message

```
Static file path '/Jay Logo 2.png' contains spaces — Wix CDN replaces spaces with
hyphens, breaking the reference. Rename the file to '/Jay-Logo-2.png' and update all
references in jay-html files.
```

### wix-media detection

Check if `@jay-framework/wix-media` resolves from `ctx.projectRoot`:

```typescript
function hasWixMedia(projectRoot: string): boolean {
    try {
        require.resolve('@jay-framework/wix-media', { paths: [projectRoot] });
        return true;
    } catch {
        return false;
    }
}
```

This makes the validator a no-op when wix-media handles image delivery.

### Scope

Only checks local paths. Bindings (`{product.image}`) are skipped — they resolve at runtime and typically come from Wix APIs (already on `wixstatic.com`).

Also checks `<link href="...">` for favicons and other static assets with spaces.

## Implementation Plan

### Phase 1: Create the validator

1. Create `packages/wix-deploy/lib/validators/static-filename-validator.ts`
2. Follow the pattern from `packages/wix-media/lib/validators/media-validator.ts`
3. Export as `validate: JayHtmlValidatorFn`

### Phase 2: Wire it up

1. Add validator declaration to `packages/wix-deploy/plugin.yaml`
2. Export from `packages/wix-deploy/lib/index.ts`
3. Add `@jay-framework/compiler-shared` and `@jay-framework/compiler-jay-html` as dependencies

## Verification Criteria

1. `npm run validate` in a project without wix-media flags images with spaces in their paths
2. `npm run validate` in a project with wix-media produces no findings from this validator
3. Images without spaces are not flagged
4. Dynamic bindings are not flagged
5. External URLs (`https://...`) are not flagged