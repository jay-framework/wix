# wix-cart — session state, not content

**Plugin** `@jay-framework/wix-cart` · **contracts** `cart-indicator`, `cart-page`, `mini-cart` (all `readonly: true`).

Cart counts, line items, quantities, coupons and totals are the **visitor's session state**, not site content. When asked to change them: edit **no data**, and **never hard-code a value or replace a `{…}` binding** in jay-html (e.g. turning `{cart.itemCount}` into `3`) — not even for one page. Reply:

"This shows the visitor's session state (their cart), not site content. There is nothing to edit here; change the template markup if you meant its look."

## Product data inside a cart line

A product's own name, price or image shown in a cart line is **product data** (wix-stores). The cart line's `itemId` is a **line item id**, not a product id — never use it as one.

To link the product: the clicked element is inside `forEach="K.lineItems"` (`trackBy="lineItemId"`). The inspector result has no product id for it, so give the products-list link — `wix-server-client/getDashboardUrl` `{ "path": "wix-stores/products" }` — naming the product from the visible text in the clicked element (`node.html`). Don't write product data from the cart.

## Not session state

Layout, CSS and markup live in jay-html — edit those normally.
