# wix-stores — dashboard-managed content

**Plugin** `@jay-framework/wix-stores` · **contracts** `product-search`, `category-products`, `product-spotlight`, `category-list`, and the dynamic `product-page`.

Product and category data (names, prices, descriptions, images, options) is managed in the **Wix dashboard**. When asked to change it: **Do not edit code.** If you can update the data at its source (a Wix API or tool you have access to), you may do so and say exactly what you changed\; otherwise give the dashboard link below.

## Steps

1. Find the product id:
   - inside `forEach` on `product-search` / `category-products`: the inspector `itemId` (trackBy `_id`);
   - `product-spotlight`: the region's `slug` prop → call `wix-stores/getProductBySlug` with `{ "slug": "<slug>" }`, take `_id`;
   - `product-page`: use `_id` if you have it, else the route's `slug` param → `getProductBySlug`.
2. Call `wix-server-client/getDashboardUrl` with `{ "path": "wix-stores/products/product/<productId>" }`.
3. Reply: "This product is managed in the Wix dashboard: <url>" and name the product.

- No product id → path `wix-stores/products`.
- Categories (`category-list`) → path `wix-stores/categories/list` (there is no per-category link).

## Not dashboard content

Layout, CSS, markup and component props (e.g. `category-products` `limit`, `categorySlug`) live in jay-html — edit those normally.
