# wix-data — dashboard-managed content

**Plugin** `@jay-framework/wix-data` · **contracts** every dynamic wix-data contract (item, list, table, card — e.g. `item/recipes-item`, `list/articles-list`).

CMS item fields (titles, text, images, references) are managed in the **Wix dashboard** CMS. When asked to change them: **do not edit code.** Identify the collection (and item) with the steps below. **Never write without an item `_id` from these steps** — a wrong id changes the wrong row. When a step doesn't give a clear answer, use a [fallback](#fallbacks): it gives a link and never writes.

**Mixed requests** (e.g. "change this title and make it bold"): edit the jay-html part normally, and handle the CMS field part with the steps below.

## Agent behavior

### Reply style

Keep replies to the site owner **short and simple** (about 1–3 sentences). They are often non-technical — use everyday words and a visual or business angle. Say **what** changed or **where** they can change the content in Wix CMS. Do **not** put file paths, code, binding syntax, or internal ids in the thread reply (use ids only in tools and in the steps below).

### Update data or send a link

- **Try to update** the CMS item when you are **confident** you have the right collection and item `_id` (steps 1–4), the request is **unambiguous**, and you have a **Wix API or tool** that can apply the change. After a successful update, confirm in plain language and include the collection dashboard link from step 6 so they can review.
- If you are **not** confident, the request is **ambiguous**, or you **lack** a working update tool → **do not write**. Build the collection link when you can and tell them where to edit in the CMS.
- If an update **fails** → say so briefly and give the dashboard link.

Do not hard-code CMS field values into jay-html.

### Ambiguity and area markers

A screenshot may show **several CMS items** (e.g. two article cards) inside one **area marker**, but inspect returns **one** `Target source` (one element, at most **one** item `_id` from step 4).

When you are unsure — several items visible, the comment does not name which row, “change these” without naming each, or the resolved `_id` may not match what they meant — **do not write**. Explain briefly what you see, which item (if any) the mark resolved to, and **ask them to clarify** (name the item, say “both”, or mark one item at a time). Use the [collection link](#fallbacks) when the item is unknown; there is no per-item dashboard URL.

## How to find this guide (materialized contracts)

1. Resolve the contract name from the inspector (`stack` region `name`, or wix-data page script `contract="…"`).
2. Read `agent-kit/plugins-index.yaml` → that contract's `path` (materialized `.jay-contract` file).
3. On that file, read **`collectionId`** and **`editingGuide`** (project-root path to this shared procedure). Open **`editingGuide`** and follow it, using **`collectionId`** from the contract — never derive collection from the contract name.
4. Do **not** rely on AIditor to paste the guide — follow the paths above.

## What you get

When the user clicks an element in the editor, you get the **source-editing inspector result**: `file` (the page jay-html), `route`, `routePattern`, `node` (the clicked element: `lines`, `tag`, `html` — its open tag, attributes and own text) and `stack` — enclosing frames, **innermost → outermost**:

- `{ kind: 'forEach', lines, itemId }` — a repeated item; `itemId` is the value of its `trackBy`.
- `{ kind: 'region', lines, name, props? }` — a `<jay:NAME …>` instance; `name` is the contract name.

All `lines` are 1-based ranges in `file`. A contract added as a page script — `<script type="application/jay-headless" plugin="@jay-framework/wix-data" contract="list/articles-list" key="K">` — produces **no** `region` frame; its items appear as `forEach="K.items"`. Only scripts with `plugin="@jay-framework/wix-data"` count.

No inspector result → fallback.

## Steps

1. **Find the contract:** the innermost `region` frame whose `name` is a wix-data contract, else the wix-data page script in `file` (`contract="…"`, `key="K"`). More than one wix-data page script → use the one whose `K` prefixes the clicked element's bindings or enclosing `forEach`.
2. **Collection id** = `collectionId` on that contract's materialized `.jay-contract` (from step 3 in [How to find this guide](#how-to-find-this-guide)). Fallback: `metadata.collectionId` on the same contract in `agent-kit/plugins-index.yaml`. **Never derive it from the contract name.** (`agent-kit/references/wix-data/collections.yaml` has the fields, not the contract mapping.)
3. **CMS field** (for writes or telling the user what to change): read `file` at `node.lines` — the binding on the clicked tag (`src`, text, sub-contract tag) gives the field key; confirm type/display name in `collections.yaml`.
4. **Item id** (needed only to write):
   - list / table: the `forEach` frame whose element in `file` has `forEach="K.items"` (or `items` inside the region) and `trackBy="_id"` → `itemId` is the item `_id`;
   - item page: the item shown by the route — look it up in the collection by the `[slug]` segment of `route`/`routePattern`, and use it only if exactly one item matches.
5. **Encode** a `/` inside the collection id as `%2F` (`Bookings/Services` → `Bookings%2FServices`); the dashboard does not open the raw form.
6. **Build the link** with `wix-server-client/getDashboardUrl` `{ "path": "wix-cms/data/<collectionId>" }`. There is no per-item dashboard link. Run it from the project root: `npx jay-stack-cli action wix-server-client/getDashboardUrl --input '{"path":"wix-cms/data/<collectionId>"}'`; the output's `url` is the link. Never read `config/.wix.yaml` or other credential files to build it.
7. **Reply** (see [Agent behavior](#agent-behavior)): plain language only — e.g. “This article title is stored in your Wix CMS; open your Articles collection here: <url>” or “I updated the title; you can check it in the CMS here: <url>”. Name the item by its visible title when you know it.

## Fallbacks

Fall back when: there is no inspector result; no wix-data contract is found; the contract has no `collectionId` on the `.jay-contract` or in `plugins-index.yaml`; or no item id is found (for a write).

- Collection known, item unknown → give the collection link and don't write.
- Collection unknown → no link; say the content is managed in the Wix CMS and you couldn't identify the collection.
- `wix-server-client/getDashboardUrl` fails → no link; say the content is in the Wix CMS (collection `<collectionId>`) and that you couldn't build the link.

## Not dashboard content

Layout, CSS, markup and which fields the template shows live in jay-html — edit those normally.
