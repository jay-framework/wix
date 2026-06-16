# Design Log 25: Product Page Head Tags

## Status

Draft

## Background

Jay Framework components can inject SEO tags into the HTML `<head>` during SSR by returning `headTags` from `phaseOutput()`. The `wix-stores` package already uses this for its product-page component — it maps the Wix `SeoSchema` (provided by the Products V3 API) to `HeadTag[]` and returns them from the slow rendering phase.

The `wix-stores-v1` package does NOT return headTags from its product-page component, despite the V1 API providing the same `seoData: SeoSchema` field on `Product`. This means pages using `wix-stores-v1` lack programmatic SEO tags (title, description, OG tags, canonical) — designers must hardcode them in templates.

## Problem

Add `headTags` support to `wix-stores-v1/product-page` so that product pages automatically get SEO metadata injected into `<head>` from the Wix product's SEO data.

## Design

### Existing Pattern (wix-stores)

`packages/wix-stores/lib/components/product-page.ts` already implements this:

```typescript
function mapSeoHeadTags(seoData: SeoSchema | undefined): HeadTag[] {
    if (!seoData) return [];
    const headTags: HeadTag[] = (seoData.tags || []).map((tag) => ({
        tag: tag.type || 'meta',
        attrs: Object.fromEntries(
            Object.entries(tag.props || {}).map(([key, value]) => [key, value as string]),
        ),
        children: tag.children || undefined,
    }));
    const keywords = seoData.settings?.keywords;
    if (keywords?.length) {
        const terms = keywords.map((k) => k.term).filter(Boolean);
        if (terms.length) {
            headTags.push({ tag: 'meta', attrs: { name: 'keywords', content: terms.join(', ') } });
        }
    }
    return headTags;
}

// In slow phase:
return { viewState, carryForward, headTags: mapSeoHeadTags(seoData) };
```

### V1 API Compatibility

The V1 `Product` type (`@wix/auto_sdk_stores_products`) has `seoData?: SeoSchema` with the same shape:
- `tags[].type` — `'title'`, `'meta'`, `'link'`, `'script'`
- `tags[].props` — `Record<string, any>` (e.g. `{ name: 'description', content: '...' }`)
- `tags[].children` — inner text (e.g. for `<title>`)
- `settings.keywords[].term` — keyword strings

The mapping logic is identical to V3.

### Change

In `packages/wix-stores-v1/lib/components/product-page.ts`:

1. Import `HeadTag` from `@jay-framework/fullstack-component` and `SeoSchema` from `@wix/auto_sdk_stores_products`
2. Add `mapSeoHeadTags()` — same logic as wix-stores
3. In `renderSlowlyChanging` → `.toPhaseOutput()`, return `headTags: mapSeoHeadTags(product.seoData)`

## Implementation Plan

### Phase 1: Add headTags to wix-stores-v1

- File: `packages/wix-stores-v1/lib/components/product-page.ts`
- Add imports: `HeadTag` from `@jay-framework/fullstack-component`, `SeoSchema` from `@wix/auto_sdk_stores_products`
- Add `mapSeoHeadTags()` function (copy pattern from wix-stores)
- Add `headTags: mapSeoHeadTags(product.seoData)` to the return object in `.toPhaseOutput()`

### Phase 2: Verify

- Build `packages/wix-stores-v1`
- Run whisky-exchange or whisky-store dev server
- Inspect `<head>` on a product page for injected SEO tags

## Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Reuse same mapping logic as wix-stores | Consistent behavior across packages | Duplicated code (small function, not worth abstracting) |
| Return headTags from slow phase | SEO tags available at build time for SSG | Fast phase would replace them if it also returns headTags |