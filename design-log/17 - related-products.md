# 17 - Related Products Component

## Background

The product page currently shows a single product in isolation. E-commerce sites typically display related products (from the same category) to encourage browsing and cross-selling.

The wix-stores plugin already has the `product-search` component which displays product cards with filters, sorting, and pagination. The related products component is structurally similar — a list of product cards — but much simpler: no filters, no search, no pagination, just a static grid scoped to a category.

## Problem

We need a `related-products` component that:

- Shows products from the same category as the current product page
- Excludes the current product from results
- Uses the same `product-card` sub-contract for rendering
- Lives on the product page (same route, different component instance)

## Questions

**Q1: How does the component receive context (which product, which category)?**

Two approaches:

- (a) Props passed directly: `categorySlug` + `productSlug` (or `productId`)
- (b) Derive from the product-page component's data (shared carry-forward or service state)

**A1:** Props. The component is standalone and doesn't share state with product-page. The jay-html template passes the route params. This means the contract needs `params` matching the product page route (slug, and optionally category/prefix).

**Q2: Should we extend the product-page contract to expose `categorySlug`?**

The product-page contract currently doesn't expose the product's category slug. The related-products component needs it to filter by category.

**A2:** Yes — add a `categorySlug` data tag to the product-page contract. The product-page component already resolves `mainCategoryId` and has access to the category tree, so mapping to slug is trivial. This is useful beyond related products (breadcrumbs, "more from this category" links, etc.).

**Q3: How to exclude the current product from results?**

The Wix `searchProducts` API doesn't support excluding by product ID natively.

**A3:** Post-filter. Fetch `pageSize + 1` products, remove the current product by slug/ID, and truncate to `pageSize`. Since we're fetching a small number (4-8 typically), over-fetching by 1 is negligible.

**Q4: Should this be a separate action or reuse `searchProducts`?**

**A4:** Reuse `searchProducts`. The existing action already supports category filtering and returns product cards. The only addition is client-side exclusion of the current product. No new action needed.

**Q5: What rendering phases does this need?**

**A5:** Slow + Fast only (no interactive phase). Related products are a static display — no user interaction beyond clicking through to a product page. The category list is slow-changing, and the product results are fast-changing (inventory/prices).

Actually — if we want add-to-cart on related product cards (quick-add), we need an interactive phase too. The product-card contract includes `addToCartButton` and quick-add options.

**Decision:** Include an interactive phase for quick-add support, mirroring product-search's card interaction handlers. This is a subset of product-search's interactive logic (only card interactions, no filters/sorting/pagination).

**Q6: How much of product-search can we reuse?**

The product-search component has:

1. Category loading and tree building → **reuse** (same service methods)
2. `searchProducts` action call → **reuse** directly
3. `mapProductToCard` from product-mapper.ts → **reuse** directly
4. Filter/sort/pagination logic → **not needed**
5. URL filter persistence → **not needed**
6. Card interaction handlers (add-to-cart, quick-add options, variant stock) → **need to reuse**

The card interaction handlers in product-search's interactive phase (~200 lines) handle `addToCartButton`, `quickOption`, `secondQuickOption`, `viewOptionsButton`, and `cardContainer` hover. These are tightly coupled to the search results signal. We should extract shared card interaction logic.

**Q7: Should we extract card interaction handlers into a shared utility?**

**A7:** Yes. Both product-search and related-products need the same card interaction logic. Extract a `setupCardInteractions(refs, resultsSignal, storesContext)` helper that wires up all product-card interactive refs. This avoids duplicating ~200 lines and keeps both components in sync.

## Design

### Contract: `related-products.jay-contract`

```yaml
name: related-products
description: Related products grid showing products from the same category. Use on product pages.
props:
  slug: string
  categorySlug: string?
  limit: number?
tags:
  - tag: products
    type: sub-contract
    repeated: true
    trackBy: _id
    phase: fast+interactive
    description: Related product cards
    link: ./product-card

  - tag: hasProducts
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether there are related products to show

  - tag: categoryName
    type: data
    dataType: string
    description: Name of the category these products belong to
```

### Product Page Contract Extension

Add to `product-page.jay-contract`:

```yaml
- {
    tag: categorySlug,
    type: data,
    dataType: string,
    description: Slug of the product's main category,
  }
```

### Component: `related-products.ts`

```
Phases:
  Slow: Resolve product → get mainCategoryId → carry forward categoryId + productId
  Fast: searchProducts({ categoryIds: [categoryId], pageSize: limit + 1 })
        → filter out current product → mapProductToCard
  Interactive: Card interactions (add-to-cart, quick-add) via shared helper
```

### Shared Card Interactions: `utils/card-interactions.ts`

Extract from product-search into a reusable function:

```typescript
interface CardRefs {
  addToCartButton: ...;
  cardContainer: ...;
  quickOption: { choices: { choiceButton: ... } };
  secondQuickOption: { choices: { choiceButton: ... } };
  viewOptionsButton: ...;
}

export function setupCardInteractions(
  cardRefs: CardRefs,
  getResults: () => ProductCardViewState[],
  setResults: (results: ProductCardViewState[]) => void,
  storesContext: WixStoresContext,
): void {
  // addToCartButton.onclick → add to cart for SIMPLE products
  // cardContainer.onmouseenter → lazy-load variant stock
  // quickOption.choices.choiceButton.onclick → color select / single-option add
  // secondQuickOption.choices.choiceButton.onclick → text choice add to cart
  // viewOptionsButton.onclick → navigate to product page
}
```

### Plugin Registration

Add to `plugin.yaml`:

```yaml
contracts:
  - name: related-products
    contract: related-products.jay-contract
    component: relatedProducts
    description: Related products from the same category
```

## Implementation Plan

### Phase 1: Product Page Extension

1. Add `categorySlug` tag to `product-page.jay-contract`
2. Map it in product-page slow render from `mainCategoryId` via category tree

### Phase 2: Extract Card Interactions

1. Create `lib/utils/card-interactions.ts`
2. Extract card interaction handlers from product-search interactive phase
3. Refactor product-search to use the shared utility
4. Verify product-search still works (no behavior change)

### Phase 3: Related Products Component

1. Create `lib/contracts/related-products.jay-contract`
2. Create `lib/components/related-products.ts` with slow/fast/interactive phases
3. Register in `plugin.yaml`
4. Export from `index.ts` and `index.client.ts`
5. Regenerate definitions

### Phase 4: Verification

1. Build the package
2. Type check passes
3. Test in an example (e.g., store-light product page)

## Trade-offs

**Reusing searchProducts action vs. a dedicated query:**

- Pro: No new API surface, consistent product card mapping
- Con: Fetches one extra product to handle exclusion; returns aggregation data we don't need
- Decision: Reuse — the overhead is negligible and reduces maintenance

**Extracting card interactions vs. duplicating:**

- Pro: Single source of truth, ~200 fewer lines to maintain
- Con: Adds coupling between components, function signature must accommodate both
- Decision: Extract — the logic is identical and will stay that way

**No pagination (load more):**

- Related products are typically 4-8 items. If more are needed, the user navigates to the category page. No pagination needed.

## Implementation Results

### Rename to `category-products` (2026-06-23)

The component was renamed from `related-products` to `category-products` to reflect that it's a general-purpose "products from a category" component, not limited to the "related products" use case on product pages.

**Two use cases:**
1. **Category product showcase** — show products from a category on any page (no `productId` needed)
2. **Related products** — show products from the same category on a product page, pass `productId` to exclude the current product

**What changed:**
- Contract: `related-products.jay-contract` → `category-products.jay-contract`
- Component export: `relatedProducts` → `categoryProducts`
- Props type: `RelatedProductsProps` → `CategoryProductsProps`
- `productId` prop is now explicitly optional in the contract description

**No behavioral changes** — the implementation is identical, only naming was updated.
