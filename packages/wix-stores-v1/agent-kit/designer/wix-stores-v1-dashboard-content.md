# wix-stores-v1 — dashboard-managed content

**Plugin** `@jay-framework/wix-stores-v1` · **contracts** `product-page`, `product-search`, `category-page`, `category-list`.

Product and collection data (names, prices, descriptions, images, options) is managed in the **Wix dashboard**. When asked to change it: **Do not edit code.** If you can update the data at its source (a Wix API or tool you have access to), you may do so and say exactly what you changed\; otherwise give the dashboard link below.

## Steps

1. Find the product id:
   - inside `forEach` on `product-search` / `category-page`: the inspector `itemId` (trackBy `_id`);
   - `product-page`: use `_id` if you have it, else the route's `slug` param → call `wix-stores-v1/getProductBySlug` with `{ "slug": "<slug>" }`, take `_id`.
2. Call `wix-server-client/getDashboardUrl` with `{ "path": "wix-stores/products/product/<productId>" }`.
3. Reply: "This product is managed in the Wix dashboard: <url>" and name the product.

- No product id → path `wix-stores/products`.
- Collections (`category-list`, the `category-page` header) → path `wix-stores/categories/list` (there is no per-collection link).

## Not dashboard content

Layout, CSS and markup live in jay-html — edit those normally.
