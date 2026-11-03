# wix-stores — dashboard-managed content

**Plugin** `@jay-framework/wix-stores` · **contracts** `product-search`, `category-products`, `product-spotlight`, `category-list`, and the dynamic `product-page`.

Product and category data (names, prices, descriptions, images, options) is managed in the **Wix dashboard**. When asked to change it: **do not edit code.** Identify the record with the steps below, then either update it at its source (a Wix API or tool you have access to) and say exactly what you changed, or give its dashboard link. **Never write without an id from these steps** — a wrong id changes, or sends the site owner to, the wrong product. When a step doesn't give a clear answer, use a [fallback](#fallbacks): it gives a list link and never writes.

**Mixed requests** (e.g. "change the price and make the title bigger"): edit the jay-html part normally, and give the dashboard link for the data part.

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

4. **Reply:**
   - link: "This product is managed in the Wix dashboard: <url>" (or "This category …");
   - write: "Updated <field> on <product name> (id <productId>) from <old> to <new>." and add the dashboard link.

   Name it if you know the name — from `wix-stores/getProductBySlug`, or text visible in `node.html`. Otherwise describe it by what the user clicked; **never invent a name.**

## Fallbacks

Give the list link instead, and say you couldn't identify the specific item:

- products → path `wix-stores/products`; categories → path `wix-stores/categories/list`

Fall back when: there is no inspector result; no `forEach` frame matches step 1 and step 2 doesn't apply; `wix-stores/getProductBySlug` returns `null`; or the slug can't be read.

If `wix-server-client/getDashboardUrl` itself fails, give no link: tell the user the data is managed in the Wix dashboard (Store Products / Categories) and that you couldn't build the link.

## Not dashboard content

Layout, CSS, markup and component props (e.g. `category-products` `limit`, `categorySlug`; `product-spotlight` `slug`) live in jay-html — edit those normally.
