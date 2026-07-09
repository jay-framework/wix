# Related Products (Product Page)

Show a row of product cards at the bottom of a product detail page — same-category siblings, excluding the product being viewed.

**Synonym:** user requests for "Related Products", "You may also like", or "More from this category" on a product page all map to the **`category-products`** contract. There is no separate `related-products` contract.

**Data model:** products from the displayed product's category (`product-page.categorySlug`), excluding the current product (`product-page._id`). This is **not** machine-learning recommendations — it is same-category catalog browsing.

## Prerequisites

The page already imports **`product-page`** with a script key (convention: `p`):

```html
<script
  type="application/jay-headless"
  plugin="@jay-framework/wix-stores"
  contract="product-page"
  key="p"
></script>
```

`p.categorySlug` and `p._id` must be available from the product-page contract.

## Import

Add a **second** headless import — **no `key`** (instance-based pattern):

```html
<script
  type="application/jay-headless"
  plugin="@jay-framework/wix-stores"
  contract="category-products"
></script>
```

## Template

Place after the main product layout, typically before the footer:

```html
<jay:category-products productId="{p._id}" categorySlug="{p.categorySlug}" limit="4">
  <section class="related-section" if="hasProducts">
    <h2>Related products</h2>
    <div class="related-grid">
      <article class="related-card" forEach="products" trackBy="_id" ref="products.cardContainer">
        <a href="{productUrl}" class="related-card-image">
          <img src="{thumbnail.url}" alt="{thumbnail.altText}" loading="lazy" />
          <span class="related-ribbon" if="hasRibbon">{ribbon.name}</span>
        </a>
        <div class="related-card-body">
          <h3 class="related-card-name">
            <a href="{productUrl}" ref="products.productLink">{name}</a>
          </h3>
          <div class="related-card-price">
            <span class="original" if="hasDiscount">{strikethroughPrice}</span>
            <span>{price}</span>
          </div>
          <button
            class="btn-add"
            ref="products.addToCartButton"
            if="quickAddType===SIMPLE && inventory.availabilityStatus===IN_STOCK"
            disabled="isAddingToCart"
          >
            <span if="!isAddingToCart">Add to Cart</span>
            <span if="isAddingToCart">Adding...</span>
          </button>
          <a
            href="{productUrl}"
            class="btn-add btn-options"
            ref="products.viewOptionsButton"
            if="quickAddType!==SIMPLE && inventory.availabilityStatus!==OUT_OF_STOCK"
          >View Options</a>
        </div>
      </article>
    </div>
  </section>
</jay:category-products>
```

Inside `<jay:category-products>`, bindings resolve to **that instance's** contract tags (`products`, `hasProducts`, `categoryName`) — not the parent `p` key.

## Props

| Prop | Value on product page | Purpose |
| --- | --- | --- |
| `productId` | `{p._id}` | Exclude the current product from results |
| `categorySlug` | `{p.categorySlug}` | Load siblings from the same category |
| `limit` | `4` (optional) | Max cards to show (default 4) |

## Refs

Product cards use the `product-card` sub-contract. Prefix refs with `products.`:

| Ref | Element |
| --- | --- |
| `products.productLink` | Product name link |
| `products.addToCartButton` | Quick add (SIMPLE products) |
| `products.viewOptionsButton` | Link to product page (configured products) |
| `products.cardContainer` | Card root (variant stock preload on hover) |

See [product-card example](../contracts/examples/product-card.md) for all available fields.

## Contract paths

| Contract | Path |
| --- | --- |
| `category-products` | `node_modules/@jay-framework/wix-stores/dist/contracts/category-products.jay-contract` |
| `product-page` | `agent-kit/materialized-contracts/wix-stores/product-page.jay-contract` (dynamic — materialized on setup) |
| `product-card` | Linked sub-contract inside `category-products` |

Or read paths from `agent-kit/plugins-index.yaml`.

## Category showcases (not product page)

To show products from a **specific** category on any page (homepage, landing page), use the same `category-products` contract with a static or param-driven `categorySlug`. Omit `productId` when there is no product to exclude. See Add Menu item **Category products** (`wix-stores:category-products`).

## Reference implementation

`examples/store-light/src/pages/products/[slug]/page.jay-html` in the wix-stores package repo — Related Products section at page bottom.

## AIditor Add Menu

Attach **Related products** (`wix-stores:related-products`) when marking an area on a product page. The item prompt includes this recipe; `jay-stack setup wix-stores` writes the catalog to `agent-kit/aiditor/add-menu/wix-stores.yaml`.
