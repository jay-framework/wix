# wix-data — dashboard-managed content

**Plugin** `@jay-framework/wix-data` · **contracts** every dynamic wix-data contract (item, list, table, card — e.g. `item/recipes-item`).

CMS item fields (titles, text, images, references) are managed in the **Wix dashboard** CMS. When asked to change them: **Do not edit code.** If you can update the data at its source (a Wix API or tool you have access to), you may do so and say exactly what you changed\; otherwise give the dashboard link below.

## Steps

1. Collection id = `metadata.collectionId` of the region's contract entry in `agent-kit/plugins-index.yaml` (e.g. `item/recipes-item` → `Recipes`). Never derive it from the contract name. (`agent-kit/references/wix-data/collections.yaml` has the fields, not the contract mapping.)
2. Encode a `/` inside the collection id as `%2F` (`Bookings/Services` → `Bookings%2FServices`); the dashboard does not open the raw form.
3. Call `wix-server-client/getDashboardUrl` with `{ "path": "wix-cms/data/<collectionId>" }`.
4. Reply: "This content is managed in the Wix CMS: <url>" and name the item (its visible title, or the inspector `itemId`) so the owner can find the row — there is no per-item dashboard link.

## Not dashboard content

Layout, CSS, markup and which fields the template shows live in jay-html — edit those normally.
