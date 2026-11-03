# wix-pro-gallery — gallery content

**Plugin** `@jay-framework/wix-pro-gallery` · **contract** `pro-gallery`.

Split the request first: slide **content** is Wix data; how the gallery **behaves and looks** is jay-html.

| Request | Where it goes |
| --- | --- |
| Replace a slide's photo; change its title, description, alt text or link; add, remove or reorder slides | Wix data — **do not edit code or data** (steps below) |
| Autoplay on/off, speed, looping | `autoplay` / `intervalMs` / `loop` props on `<jay:pro-gallery>` in jay-html — check there first |
| Show a different gallery | the `galleryId` prop in jay-html |
| Buttons, layout, slide CSS, counters | the template (jay-html / CSS) |
| Native Pro Gallery widget settings (spacing, hover effects) | not used by Jay rendering — say so, and edit the template instead |

## Slide content

Wix Pro Gallery has **no dashboard page**: galleries are edited in the Wix Editor's gallery manager. Never send the owner to Media Manager — it holds the image files, not the gallery's slides.

1. Gallery id = the region's `galleryId` prop. Slide = the inspector `itemId` inside `forEach="items"` (trackBy `itemId`) and its visible title.
2. Call `wix-server-client/getDashboardUrl` with `{ "path": "home" }`.
3. Reply: "Gallery slides are managed by Wix Pro Gallery (gallery `<galleryId>`, slide `<title or itemId>`). It has no dashboard page; edit it in the Wix Editor's gallery manager. Site dashboard: <url>".

Do not change `{url}` / `{mediaId}` bindings in jay-html to swap a slide's image. For an image the user attaches for **non-bound** markup, follow the wix-media guidance instead.
