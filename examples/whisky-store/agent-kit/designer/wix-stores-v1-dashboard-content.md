# wix-stores-v1 — dashboard-managed content

**Plugin** `@jay-framework/wix-stores-v1` · **contracts** `product-page`, `product-search`, `category-page`, `category-list`.

Product and collection data (names, prices, descriptions, images, options) is managed in the **Wix dashboard**. When asked to change it: **do not edit code.** Identify the record with the steps below. **Never write without an id from these steps** — a wrong id changes, or sends the site owner to, the wrong product. When a step doesn't give a clear answer, use a [fallback](#fallbacks): it gives a list link and never writes.

**Mixed requests** (e.g. "change the price and make the title bigger"): edit the jay-html part normally, and handle the catalog data part with the steps below.

## Agent behavior

### Reply style

Keep replies to the site owner **short and simple** (about 1–3 sentences). They are often non-technical — use everyday words and a visual or business angle. Say **what** changed or **where** they can change the product or collection in Wix. Do **not** put file paths, code, binding syntax, or internal ids in the thread reply (use ids only in tools and in the steps below).

### Update data or send a link

- **Try to update** when you are **confident** you have the right record id (steps 1–2), the request is **unambiguous**, and you have a **Wix API or tool** that can apply the change. After a successful update, confirm in plain language and include the dashboard link from step 3 so they can review.
- If you are **not** confident, the request is **ambiguous**, or you **lack** a working update tool → **do not write**. Build the dashboard link when you can and tell them where to edit in the Wix Stores dashboard.
- If an update **fails** → say so briefly and give the dashboard link.

Do not hard-code catalog values into jay-html.

### Ambiguity and area markers

A screenshot may show **several products or collections** inside one **area marker**, but inspect returns **one** `Target source` (one element, at most **one** record id from the steps below).

When you are unsure — several items visible, the comment does not name which one, “change these” without naming each, or the resolved id may not match what they meant — **do not write**. Explain briefly what you see, which item (if any) the mark resolved to, and **ask them to clarify** (name the product or collection, say “both”, or mark one item at a time). Use the [fallback](#fallbacks) list link when several items might be in scope; use a single-record link only when the steps gave one clear id.

## What you get

When the user clicks an element in the editor, you get the **source-editing inspector result**: `file` (the page jay-html), `route`, `routePattern`, `node` (the clicked element: `lines`, `tag`, `html` — its open tag, attributes and own text) and `stack` — enclosing frames, **innermost → outermost**:

- `{ kind: 'forEach', lines, itemId }` — a repeated item; `itemId` is the value of its `trackBy`.
- `{ kind: 'region', lines, name, props? }` — a `<jay:NAME …>` instance; `props` are its static props.

All `lines` are 1-based ranges in `file`. This plugin's contracts are added as page scripts — `<script type="application/jay-headless" plugin="@jay-framework/wix-stores-v1" contract="X" key="K">` in `<head>` — which produce **no** `region` frame; their lists appear as `forEach="K.<list>"`. Only scripts with `plugin="@jay-framework/wix-stores-v1"` count.

No inspector result → fallback.

## Steps

1. **Find the record.** Go through the `forEach` frames in `stack`, innermost first. For each, read the element in `file` at the frame's `lines` and match its `forEach="…"` against this table. A row matches only if the element also has `trackBy="_id"`.

   | `forEach` attribute | page script | `itemId` is |
   |---------------------|-------------|-------------|
   | `K.searchResults` | `contract="product-search" key="K"` | product `_id` |
   | `K.products` or `K.loadedProducts` | `contract="category-page" key="K"` | product `_id` |
   | `K.categories` | `contract="category-list" key="K"` | collection `_id` |

   Use the **first** frame that matches. Any other `forEach` (`suggestions`, `filters…`, `breadcrumbs`, `media…`, `options`, `choices`, `modifiers`, `infoSections`, …) is **not** a product or collection — skip it and keep going outward.

2. **No match in step 1:**
   - **Product page** — `file` has a page script `contract="product-page"`: slug = the script body's `slug:` value if present, otherwise the value in `route` at the `[slug]` segment of `routePattern`. Call `wix-stores-v1/getProductBySlug` with `{ "slug": "<slug>" }`; product id = the result's `_id`, name = its `name`. On a product page, **never** use a `forEach` `itemId` — those are option / info-section / modifier ids.
   - **Collection page** (click outside its product list, e.g. the header) — page script `contract="category-page"`: it's the collection; use the collections link.
   - Neither applies → fallback.

3. **Build the link** with `wix-server-client/getDashboardUrl` `{ "path": "<path>" }`:
   - product → `wix-stores/products/product/<productId>`
   - collection → `wix-stores/categories/list` (no per-collection link is verified for Catalog V1)

   Run from the project root: `npx jay-stack-cli action wix-server-client/getDashboardUrl --input '{"path":"<path>"}'`; the output's `url` is the link. Never read `config/.wix.yaml` or other credential files to build it.

4. **Reply** (see [Agent behavior](#agent-behavior)): plain language only — e.g. “This product is in your Wix Stores catalog; edit it here: <url>” or “I updated the name; review it here: <url>”. Name it from `getProductBySlug` or visible text; **never invent a name.**

## Fallbacks

Give the list link instead, and say you couldn't identify the specific item: products → path `wix-stores/products`; collections → path `wix-stores/categories/list`.

Fall back when: there is no inspector result; no step matches; `trackBy` isn't `_id`; `wix-stores-v1/getProductBySlug` returns `null`; or the slug can't be read.

If `wix-server-client/getDashboardUrl` itself fails, give no link: say the data is managed in the Wix dashboard (Store Products / Categories) and that you couldn't build the link.

## Not dashboard content

Layout, CSS and markup live in jay-html — edit those normally.
