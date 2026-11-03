# wix-cart — session state, not content

**Plugin** `@jay-framework/wix-cart` · **contracts** `cart-indicator`, `cart-page`, `mini-cart` (all `readonly: true`).

Cart counts, line items, quantities and totals are the **visitor's session state**, not site content. When asked to change them, edit no code and no data, and reply:

"This shows the visitor's session state (cart / login), not site content. There is nothing to edit here; change the template markup if you meant its look."

A product's own name, price or image inside a cart line is product data — see the wix-stores dashboard-content guide. Layout, CSS and markup live in jay-html — edit those normally.
