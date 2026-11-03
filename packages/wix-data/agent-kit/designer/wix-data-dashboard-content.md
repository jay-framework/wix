# wix-data — dashboard-managed content

**Plugin** `@jay-framework/wix-data` · **contracts** every dynamic wix-data contract (item, list, table, card — e.g. `item/recipes-item`, `list/articles-list`).

CMS item fields (titles, text, images, references) are managed in the **Wix dashboard** CMS. When asked to change them: **do not edit code.** Identify the collection (and item) with the steps below, then either update the item at its source (a Wix API or tool you have access to) and say exactly what you changed, or give the collection's dashboard link. **Never write without an item `_id` from these steps** — a wrong id changes the wrong row. When a step doesn't give a clear answer, use a [fallback](#fallbacks): it gives a link and never writes.

**Mixed requests** (e.g. "change this title and make it bold"): edit the jay-html part normally, and give the dashboard link for the data part.

## What you get

When the user clicks an element in the editor, you get the **source-editing inspector result**: `file` (the page jay-html), `route`, `routePattern`, `node` (the clicked element: `lines`, `tag`, `html` — its open tag, attributes and own text) and `stack` — enclosing frames, **innermost → outermost**:

- `{ kind: 'forEach', lines, itemId }` — a repeated item; `itemId` is the value of its `trackBy`.
- `{ kind: 'region', lines, name, props? }` — a `<jay:NAME …>` instance; `name` is the contract name.

All `lines` are 1-based ranges in `file`. A contract added as a page script — `<script type="application/jay-headless" plugin="@jay-framework/wix-data" contract="list/articles-list" key="K">` — produces **no** `region` frame; its items appear as `forEach="K.items"`. Only scripts with `plugin="@jay-framework/wix-data"` count.

No inspector result → fallback.

## Steps

1. **Find the contract:** the innermost `region` frame whose `name` is a wix-data contract, else the wix-data page script in `file` (`contract="…"`, `key="K"`). More than one wix-data page script → use the one whose `K` prefixes the clicked element's bindings or enclosing `forEach`.
2. **Collection id** = `metadata.collectionId` of that contract's entry under `wix-data` in `agent-kit/plugins-index.yaml` (e.g. `list/articles-list` → `Articles`). **Never derive it from the contract name.** (`agent-kit/references/wix-data/collections.yaml` has the fields, not the contract mapping.)
3. **Item id** (needed only to write):
   - list / table: the `forEach` frame whose element in `file` has `forEach="K.items"` (or `items` inside the region) and `trackBy="_id"` → `itemId` is the item `_id`;
   - item page: the item shown by the route — look it up in the collection by the `[slug]` segment of `route`/`routePattern`, and use it only if exactly one item matches.
4. **Encode** a `/` inside the collection id as `%2F` (`Bookings/Services` → `Bookings%2FServices`); the dashboard does not open the raw form.
5. **Build the link** with `wix-server-client/getDashboardUrl` `{ "path": "wix-cms/data/<collectionId>" }`. There is no per-item dashboard link.
6. **Reply:**
   - link: "This content is managed in the Wix CMS: <url>", naming the item (its visible title in `node.html`, or its `_id`) so the owner can find the row;
   - write: "Updated <field> on <item title> (collection <collectionId>, id <itemId>) from <old> to <new>." and add the link.

## Fallbacks

Fall back when: there is no inspector result; no wix-data contract is found; the contract has no `collectionId` in `plugins-index.yaml`; or no item id is found (for a write).

- Collection known, item unknown → give the collection link and don't write.
- Collection unknown → no link; say the content is managed in the Wix CMS and you couldn't identify the collection.
- `wix-server-client/getDashboardUrl` fails → no link; say the content is in the Wix CMS (collection `<collectionId>`) and that you couldn't build the link.

## Not dashboard content

Layout, CSS, markup and which fields the template shows live in jay-html — edit those normally.
