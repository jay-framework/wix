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

**Mixed requests** (e.g. "replace this photo and slow the slideshow"): edit the jay-html part normally, and handle the slide part with the steps below.

## What you get

When the user clicks an element in the editor, you get the **source-editing inspector result**: `file` (the page jay-html), `node` (the clicked element: `lines`, `tag`, `html` — its open tag, attributes and own text) and `stack` — enclosing frames, **innermost → outermost**:

- `{ kind: 'forEach', lines, itemId }` — a repeated item; `itemId` is the value of its `trackBy`.
- `{ kind: 'region', lines, name, props? }` — a `<jay:NAME …>` instance; `props` are its static props.

All `lines` are 1-based ranges in `file`. Count a `region` frame named `pro-gallery` only if `<head>` has `<script type="application/jay-headless" plugin="@jay-framework/wix-pro-gallery" contract="pro-gallery">`.

## Slide content

Wix Pro Gallery has **no dashboard page**: galleries are edited in the Wix Editor's gallery manager. Never send the owner to Media Manager — it holds the image files, not the gallery's slides.

1. **Gallery id** = `props.galleryId` of the `region` frame named `pro-gallery`; if missing, read the `galleryId="…"` attribute on that `<jay:pro-gallery>` tag in `file` at the frame's `lines`. No region frame, or the attribute is a binding (`{…}`) → say "this gallery" without an id.
2. **Slide** = the `forEach` frame whose element in `file` has `forEach="items"` and `trackBy="itemId"` → `itemId` is the slide id. Name it by its visible title in `node.html`. Slides can autoplay: trust the inspector's `itemId`, not a screenshot. No such frame → say "this slide" without an id.
3. Call `wix-server-client/getDashboardUrl` with `{ "path": "home" }`.
4. Reply: "Gallery slides are managed by Wix Pro Gallery (gallery `<galleryId>`, slide `<title or itemId>`). It has no dashboard page; edit it in the Wix Editor's gallery manager. Site dashboard: <url>". If `getDashboardUrl` fails, send the same reply without the link.

Do not change `{url}` / `{mediaId}` bindings in jay-html to swap a slide's image. For an image the user attaches for **non-bound** markup, follow the wix-media guidance instead.
