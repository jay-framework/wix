# wix-pro-gallery — gallery content

**Plugin** `@jay-framework/wix-pro-gallery` · **contract** `pro-gallery`.

Split the request first: slide **content** is Wix data; how the gallery **behaves and looks** is jay-html.

| Request | Where it goes |
| --- | --- |
| Replace a slide's photo; change its title, description, alt text or link; add, remove or reorder slides | Wix data — **do not edit code** (steps below) |
| Autoplay on/off, speed, looping | `autoplay` / `intervalMs` / `loop` props on `<jay:pro-gallery>` in jay-html — check there first |
| Show a different gallery | the `galleryId` prop in jay-html |
| Buttons, layout, slide CSS, counters | the template (jay-html / CSS) |
| Native Pro Gallery widget settings (spacing, hover effects) | not used by Jay rendering — say so, and edit the template instead |

**Mixed requests** (e.g. "replace this photo and slow the slideshow"): edit the jay-html part normally, and handle the slide part with the steps below.

## Wix Headless (typical Jay sites)

Pro Gallery slides are **not** CMS or store catalog data. Each gallery is its own list in the Pro Gallery app; the page reads it live by `galleryId`.

On **Wix Headless** sites there is **no Wix Editor** and **no Pro Gallery screen in the site dashboard** (Manage Apps may list the app without an "Open" link). Owners **cannot** visually edit slides in the dashboard the way they edit Forms, Stores, or Bookings.

For slide **content** on headless:

- **Do not** tell the owner to use the Wix Editor or send them to dashboard **home** as a substitute — that is a dead end.
- **Do** update slides through the **Pro Gallery API** when you have a working Wix API or tool (steps below).
- If you **lack** a working update tool → **do not change bindings in jay-html**; explain honestly (see [Reply examples](#reply-examples)) and offer to make the change **only when** the project gives you Wix API access (e.g. the user allows the Wix connection in AIditor).

On a **classic Wix site that still has the Editor**, slides can also be edited in the Editor's Pro Gallery manager — mention that only when you know the site uses the Editor, not as the default for Jay headless projects.

## Agent behavior

### Reply style

Keep replies to the site owner **short and simple** (about 1–3 sentences). They are often non-technical — use everyday words and a visual or business angle. Say **what** changed or **what is possible** on their site. Do **not** put file paths, code, binding syntax, or internal ids in the thread reply (use ids only in tools and in the steps below).

### Update data or send a link

- **Try to update** a slide when you are **confident** you have the right gallery and slide (steps 1–2), the request is **unambiguous**, and you have a **Wix API or tool** that can change gallery items (step 3). After a successful update, confirm in plain language (see [Reply examples](#reply-examples)).
- If you are **not** confident, the request is **ambiguous**, or you **lack** a working update tool → **do not write**. Use a [headless reply example](#reply-examples) or ask them to clarify.
- If an update **fails** → say so briefly; on headless, do **not** fall back to "use the Wix Editor."

Never send the owner to **Media Manager** for a slide change — it holds files, not the gallery's ordered slides. (Upload new files to Media Manager first when the API needs a media id, then PATCH the gallery item.)

### Ambiguity and area markers

A screenshot may show **several slides** inside one **area marker**, but inspect returns **one** `Target source` (one element, at most **one** slide `itemId` from step 2).

When you are unsure — several slides visible, the comment does not say which slide, or autoplay moved the carousel — **do not write**. Explain briefly what you see, which slide (if any) the mark resolved to, and **ask them to clarify** (name the slide or mark one slide at a time). Trust the inspector's `itemId` over the screenshot when they differ.

## What you get

When the user clicks an element in the editor, you get the **source-editing inspector result**: `file` (the page jay-html), `node` (the clicked element: `lines`, `tag`, `html` — its open tag, attributes and own text) and `stack` — enclosing frames, **innermost → outermost**:

- `{ kind: 'forEach', lines, itemId }` — a repeated item; `itemId` is the value of its `trackBy`.
- `{ kind: 'region', lines, name, props? }` — a `<jay:NAME …>` instance; `props` are its static props.

All `lines` are 1-based ranges in `file`. Count a `region` frame named `pro-gallery` only if `<head>` has `<script type="application/jay-headless" plugin="@jay-framework/wix-pro-gallery" contract="pro-gallery">`.

No inspector result → you can't identify the slide; ask them to mark one slide element.

## Slide content

1. **Gallery id** = `props.galleryId` of the `region` frame named `pro-gallery`; if missing, read the `galleryId="…"` attribute on that `<jay:pro-gallery>` tag in `file` at the frame's `lines`. No region frame, or the attribute is a binding (`{…}`) → you can't PATCH safely; explain without ids.
2. **Slide** = the `forEach` frame whose element in `file` has `forEach="items"` and `trackBy="itemId"` → `itemId` is the slide id. Name it by its visible title in `node.html`. Slides can autoplay: trust the inspector's `itemId`, not a screenshot. No such frame → say "this slide" without an id; don't PATCH without `itemId`.
3. **Update at source** (when you have Wix API access): use the [Pro Gallery API](https://dev.wix.com/docs/api-reference/assets/pro-gallery/update-gallery-item) — **do not** edit `{url}` / `{mediaId}` in jay-html.

   - **Replace the slide image:** the new image must already be in **Wix Media** (upload or import first — follow wix-media guidance if the user attached a file). Then:

     `PATCH https://www.wixapis.com/progallery/v2/galleries/{galleryId}/items/{itemId}`

     with a body that sets the image, for example:

     ```json
     {
       "item": {
         "id": "<itemId>",
         "image": {
           "imageInfo": {
             "id": "<wixMediaImageGuid>",
             "height": 1200,
             "width": 1800
           }
         }
       }
     }
     ```

     Use the real width and height from Media Manager or the upload response. You may also set `altText`, `title`, `description`, or link fields on the same `item` object when the owner asked for those.

   - **Add, remove, or reorder slides:** use the Pro Gallery API endpoints for create/delete/reorder items (same gallery id). Do not simulate this in jay-html.

   Call through whatever Wix client or MCP tool the project exposes (same auth as other Wix REST calls). There is no Jay `jay-stack` devOnly action for gallery writes yet — raw REST or an MCP wrapper is fine when permitted.

4. **Reply** — plain language only; see [Reply examples](#reply-examples).

### Reply examples

   - **After a successful API update:** “I updated the photo on the *[slide title]* slide — refresh the gallery page to see it.”
   - **Headless, no update tool yet (e.g. user hasn't allowed Wix access):** “This photo is a slide in your Pro Gallery. On this site there isn't a gallery editor in the Wix dashboard — if you'd like, I can replace it for you once you allow the Wix connection.”
   - **Headless, no agent/API path at all:** “This slide is managed by Pro Gallery, not in your page code. There isn't a visual screen to edit it on a headless site; someone with API access would need to update it.”
   - **Classic Editor site (only when applicable):** “This photo is part of your Pro Gallery — open the site in the Wix Editor and use the gallery manager for that gallery.”

   Do **not** link dashboard **home** as the way to edit slide content on headless sites.

Do not change `{url}` / `{mediaId}` bindings in jay-html to swap a slide's image. For an image the user attaches for **non-bound** markup, follow the wix-media guidance instead.
