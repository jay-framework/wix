# Design Log 33: Wix Pro Gallery Plugin

## Status

Implemented

## Background

Wix Pro Gallery is one of the most used Wix widgets. Site owners create galleries in the Editor (grid, masonry, slider, slideshow, thumbnails, ...). Each gallery has a backend counterpart readable through the [Pro Gallery API](https://dev.wix.com/docs/api-reference/assets/pro-gallery/introduction):

- `GET /progallery/v2/galleries/{galleryId}` returns the gallery and its items: image or video, title, description, link and sort order.
- Visitor (OAuth) tokens can read it. This was verified on a Classic site, so no API key is needed.
- The gallery id of a placed widget sits in the site's warmup data as `appsWarmupData["14271d6f-…"]["<compId>_appSettings"].galleryId`. Site owners also see it in the dashboard.

Jay has no gallery integration. A Jay site that wants a Wix gallery has to hard-code the images, so edits made in the Wix dashboard never show up. The Classic-to-Jay migration effort needs this for slideshow galleries, which are common on store home pages.

## Problem

We need a headless component that:

1. Loads a Pro Gallery's items **live** from Wix by gallery id.
2. Exposes the slideshow navigation state that every interactive layout (slideshow, slider, thumbnails) needs: current item, next and previous, autoplay, looping, and selecting an item.
3. Leaves all markup and layout to the template, like every Jay headless component. A grid uses only `items`; a slideshow also uses the navigation tags.

## Questions and Answers

**Q: Keyed or instance-based?**
A: Instance-based (`<jay:pro-gallery galleryId="…">`). A page can hold several galleries, and the gallery id is a prop.

**Q: Which phase fetches the items?**
A: Fast. Items are fetched per request (or at export time for static sites), so dashboard edits appear without rebuilding. The response is small, typically 4–50 items.

**Q: Images in the contract: final URLs or base URLs?**
A: Base media URLs (`https://static.wixstatic.com/media/<id>`) plus the original width and height. This matches `wix-stores` (`formatWixMediaUrl`): the template appends the Wix image transform it needs (`/v1/fill/w_980,h_544,…/file.jpg`).

**Q: How does a template position slides when a loop gives no index?**
A: Each item exposes `index`, and the root exposes `currentIndex`. Templates use CSS custom properties, e.g. `style="--i:{index}"` and `style="--current:{currentIndex}"`, plus `transform: translateX(calc(var(--current) * -100%))`.

**Q: Autoplay timing and visibility?**
A: Autoplay runs only in the browser, every `intervalMs` (default 4000, the Pro Gallery default). It pauses while the tab is hidden, stops after the last item unless `loop` is set, and resets its timer after any manual navigation.

**Q: Video items?**
A: They are exposed with `mediaType = VIDEO` and the poster URL. Playback is out of scope for this log.

## Design

### Contract: `pro-gallery`

```yaml
props: galleryId (string), autoplay (boolean), intervalMs (number), loop (boolean)
tags (fast+interactive unless noted):
  hasItems, itemCount, currentIndex, currentPosition (1-based)
  hasPrevious, hasNext, isPlaying
  previousButton, nextButton, playPauseButton   (interactive, HTMLElement)
  items[] trackBy itemId:
    itemId, index, title, description, altText, link
    mediaType (IMAGE | VIDEO), url, width, height
    isCurrent (variant)
    selectButton (interactive, HTMLElement)
```

### Package layout: `packages/wix-pro-gallery`

```
lib/contracts/pro-gallery.jay-contract
lib/wix-apis/get-gallery.ts             GET /progallery/v2/galleries/{id}, all pages
lib/utils/project-gallery-items.ts      API item -> contract item (pure)
lib/utils/slideshow.ts                  next / previous / select / autoplay rules (pure)
lib/services/pro-gallery-service.ts     WIX_PRO_GALLERY_SERVICE (getItems)
lib/components/pro-gallery.ts           makeJayStackComponent: fast fetch + interactive navigation
lib/init.ts, index.ts, index.client.ts, tools.ts (setup), plugin.yaml
test/…                                   fixtures: real API response, expected projection
```

### Navigation rules (`slideshow.ts`)

| Action                | loop=false    | loop=true    |
| --------------------- | ------------- | ------------ |
| next at last          | stays         | goes to 0    |
| previous at 0         | stays         | goes to last |
| autoplay tick at last | stops playing | goes to 0    |
| select(i)             | i, clamped    | i, clamped   |

- `hasNext` / `hasPrevious` are true when looping and there is more than one item.
- With zero items: index 0, all flags false, and autoplay off.

### Example template (slideshow)

```html
<jay:pro-gallery galleryId="66f6bc8b-…" autoplay="true" intervalMs="4000" loop="true">
  <div class="track" style="--current:{currentIndex}">
    <div class="slide" forEach="items" trackBy="itemId" style="--i:{index}">
      <img src="{url}/v1/fill/w_980,h_544,al_c,q_85/file.jpg" alt="{altText}" />
    </div>
  </div>
  <button ref="previousButton" if="hasPrevious">‹</button>
  <button ref="nextButton" if="hasNext">›</button>
  <span>{currentPosition} / {itemCount}</span>
</jay:pro-gallery>
```

## Implementation Plan

1. Pure utilities and tests: projecting API items, navigation rules.
2. API layer and service.
3. Component: fast phase fetch and interactive navigation with autoplay.
4. Plugin wiring: `plugin.yaml`, init, entries, setup, build, `validate-plugin`.
5. End-to-end check: a Jay page binding a real Classic site's gallery, from the migrate-store-to-jay compiler.

## Trade-offs

- **Fast-phase fetch:** costs one API call per request, in exchange for live dashboard edits. Static exports refresh on re-export.
- **No layout settings in the contract:** spacing, sizes and arrows belong to the template. Gallery style settings live in the widget's editor settings, not in the Pro Gallery API, so the compiler reads them separately.

## Verification Criteria

- Unit tests pass for the projection (real fixture) and the navigation table.
- `jay-stack-cli validate-plugin` passes.
- A migrated Classic home-page slideshow:
  - renders the gallery's items from the API
  - autoplays and responds to next/previous
  - matches the original at slide 0 in pixel verification

## Implementation Results

Implemented as designed in `packages/wix-pro-gallery`. Tests: 11/11 passing (projection fixtures from a real Classic site's gallery plus a synthetic mixed gallery, the navigation table, and API paging). `validate-plugin` passes.

**Deviations from the design:**

- **Added `items[].mediaId`.** The Wix image service picks its encoding using the URL's trailing file name. On the reference site, `…/v1/fill/…/<mediaId>` and `…/v1/fill/…/file.jpg` returned different AVIF bytes (11665 vs. 11566 bytes). Templates need the media id to produce byte-identical images. The contract now documents the URL as `{url}/v1/…/{mediaId}`.
- **Props are coerced.** jay-html passes literal prop values as strings, so `"true"` and `"4000"` are converted to a boolean and a number.

**Verified end to end with the migrate-store-to-jay compiler:**

- **Test setup:** the home-page slideshow of the reference Classic site (4 images, autoplay, loop) was compiled into `<jay:pro-gallery …>` and deployed to Wix Headless hosting.
- **Static match:** 0.00% pixel difference vs. the original at the first slide.
- **Autoplay match:** 0.00% one autoplay interval later.

**Framework issues found while integrating.** Fixed upstream in `jay-framework/jay` (separate PR):

1. **Hydrate codegen dropped dynamic `style` bindings.** Style values compile to dynamic properties (`dp`), but the hydrate attribute renderer only kept `style` maps that contained dynamic _attributes_.
2. **`adoptBase` ignored per-property style maps,** so even emitted bindings were not connected.
3. **CSS custom properties were camel-cased** (`--x-y` → `-XY`) and set with property assignment. They are now kept verbatim and set with `setProperty`.
4. **Not fixed: instance components at the top of `<body>`.** An instance component that is a direct child of `<body>` breaks its coordinates, both SSR bindings and hydration. Wrapping it in an element avoids it. Reported, not fixed.

Until those fixes are released, the slideshow position (`style="transform: …{currentIndex}…"`) does not update after hydration. Navigation state, refs and classes do.
