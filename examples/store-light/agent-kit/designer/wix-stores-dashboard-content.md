# wix-stores — dashboard-managed content

**Plugin** `@jay-framework/wix-stores` · **contracts** `product-search`, `category-products`, `product-spotlight`, `category-list`, and the dynamic `product-page`.

Product and category data (names, prices, descriptions, images, options) is managed in the **Wix dashboard**. When asked to change it: **do not edit code.** Identify the record with the steps below. **Never write without an id from these steps** — a wrong id changes, or sends the site owner to, the wrong product or category. When a step doesn't give a clear answer, use a [fallback](#fallbacks): it gives a list link and never writes.

**Mixed requests** (e.g. "change the price and make the title bigger"): edit the jay-html part normally, and handle the catalog data part with the steps below.

## Agent behavior

### Reply style

Keep replies to the site owner **short and simple** (about 1–3 sentences). They are often non-technical — use everyday words and a visual or business angle. Say **what** changed or **where** they can change the product or category in Wix. Do **not** put file paths, code, binding syntax, or internal ids in the thread reply (use ids only in tools and in the steps below).

### Update data or send a link

- If you are **not** confident, the request is **ambiguous**, or you **lack** a working update tool → **do not write**. Build the dashboard link when you can and tell them where to edit in the Wix Stores dashboard.
- If an update **fails** → say so briefly and give the dashboard link.

Do not hard-code catalog values into jay-html.

### Ambiguity and area markers

A screenshot may show **several products or categories** inside one **area marker**, but inspect returns **one** `Target source` (one element, at most **one** record id from the steps below).

When you are unsure — several items visible, the comment does not name which one, “change these” without naming each, or the resolved id may not match what they meant — **do not write**. Explain briefly what you see, which item (if any) the mark resolved to, and **ask them to clarify** (name the product or category, say “both”, or mark one item at a time). Use the [fallback](#fallbacks) list link when several items might be in scope; use a single-record link only when the steps gave one clear id.

## What you get

When the user clicks an element in the editor, you get the **source-editing inspector result** for it: `file` (the page jay-html), `route`, `routePattern`, `node`, and `stack`.

- `node` — the clicked element: `lines`, `tag`, `html` (its open tag, attributes and own text), `rect`, and `contentFromBinding` when its content comes from data. `null` if nothing marked was hit.
- `stack` — enclosing frames, **innermost → outermost**:
  - `{ kind: 'forEach', lines, itemId }` — a repeated item; `itemId` is that item's `trackBy` value (`_id` for every list in the table below).
  - `{ kind: 'region', lines, name, props? }` — a component instance written as `<jay:NAME …>` in the jay-html; `name` is `NAME` (e.g. `<jay:category-products>` → `category-products`), `props` are its static props.

All `lines` are 1-based line ranges in `file` — markers are only added to the page jay-html.

**Page-level contracts produce no `region` frame.** A contract added with `<script type="application/jay-headless" plugin="@jay-framework/wix-stores" contract="X" key="K">` in the page `<head>` is identified by reading `file`, and its lists appear as `forEach="K.<list>"`.

**Plugin check:** every row below counts only when the contract comes from `plugin="@jay-framework/wix-stores"` — the page script with that `key`, or (for a `region` frame) the `<head>` script that imports that contract. A same-named contract from another plugin doesn't count.

No inspector result → you can't identify a record; use a fallback.

## Steps

1. **Find the record.** Go through the `forEach` frames in `stack`, innermost first. For each, read the `forEach="…"` attribute in `file` at the frame's `lines`, and match it against this table:

   | `forEach` attribute | Where | `itemId` is |
   |---------------------|-------|-------------|
   | `K.searchResults` | page script `contract="product-search" key="K"` | product `_id` |
   | `K.products` | page script `contract="category-products" key="K"` | product `_id` |
   | `products` | inside a `region` frame named `category-products` | product `_id` |
   | `K.categories` | page script `contract="category-list" key="K"` | category `_id` |
   | `categories` | inside a `region` frame named `category-list` | category `_id` |

   A row matches only if the same element also has `trackBy="_id"`; any other `trackBy` → fallback. Use the **first** frame that matches. Any other `forEach` (`suggestions`, `filters…`, `options`, `choices`, `modifiers`, `infoSections`, `mediaGallery…`, `lineItems`, …) is **not** a product or category — skip it and keep going outward.

2. **No match in step 1 → the product comes from a spotlight or the page.** Check in this order; the first that applies wins — a click inside a `<jay:product-spotlight>` on a product page is the **spotlight's** product, not the page's:
   - **Spotlight** — the innermost `region` frame named `product-spotlight`: slug = `props.slug`; if missing, read the `slug="…"` attribute on the `<jay:product-spotlight>` tag in `file` at the frame's `lines`.
   - **Product page** — `file` has a page script with `contract="product-page"` (wix-stores plugin): slug = the script body's `slug:` value if present (static product pages, e.g. `slug: ceramic-flower-vase`); otherwise the value in `route` at the `[slug]` segment of `routePattern`.
   - Then call `wix-stores/getProductBySlug` with `{ "slug": "<slug>" }`; product id = the result's `_id`, product name = its `name`.
   - Neither applies → fallback.

3. **Build the link** with `wix-server-client/getDashboardUrl` `{ "path": "<path>" }`:
   - product → `wix-stores/products/product/<productId>`
   - category → `wix-stores/categories/list/category/<categoryId>`

   Run it from the project root: `npx jay-stack-cli action wix-server-client/getDashboardUrl --input '{"path":"<path>"}'`; the output's `url` is the link. Never read `config/.wix.yaml` or other credential files to build it.

4. **Reply** (see [Agent behavior](#agent-behavior)): plain language only — e.g. “This product lives in your Wix Stores catalog; change it here: <url>” or “I updated the price; you can check it here: <url>”. Name the product or category from visible text or `getProductBySlug`; **never invent a name.**

## Fallbacks

Give the list link instead, and say you couldn't identify the specific item:

- products → path `wix-stores/products`; categories → path `wix-stores/categories/list`

Fall back when: there is no inspector result; no `forEach` frame matches step 1 and step 2 doesn't apply; `wix-stores/getProductBySlug` returns `null`; or the slug can't be read.

If `wix-server-client/getDashboardUrl` itself fails, give no link: tell the user the data is managed in the Wix dashboard (Store Products / Categories) and that you couldn't build the link.

## Not dashboard content

Layout, CSS, markup and component props (e.g. `category-products` `limit`, `categorySlug`; `product-spotlight` `slug`) live in jay-html — edit those normally.
