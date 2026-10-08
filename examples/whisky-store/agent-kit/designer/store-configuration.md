# Wix Stores V1 — store configuration

Optional project config for **Catalog V1** stores (`@jay-framework/wix-stores-v1`). For Catalog V3, use `config/.wix-stores.yaml` with `@jay-framework/wix-stores` instead.

## File location

`config/.wix-stores-v1.yaml` — created by `jay-stack setup wix-stores-v1` when missing.

## Example

```yaml
# BCP 47 — Wix dashboard → Settings → Language & region (regional settings).
# Omit to keep API formatted prices on product cards.
locale: 'he-IL'

# Product URL slugs (V1 `product.slug`), top-of-grid order on the default shop listing.
productOrder:
  - 'i-m-a-product'
  - 'blue-widget'
  - 'sale-item'
```

## Fields

| Field | Type | Values | Behavior |
| ----- | ---- | ------ | -------- |
| **`locale`** | string (optional) | BCP 47 tag, e.g. `he-IL`, `ja-JP`, `en-US` | Reformats **product card** prices in `searchProducts` / `getProductBySlug` via `Intl.NumberFormat`. **Product page (PDP) prices still use API formatted strings** until wired in a follow-up. |
| **`productOrder`** | string[] (optional) | Each entry = one product **`slug`** from the V1 API | Applies only when `searchProducts` uses **`sortBy: relevance`**, **no text query**, and **no filters** (no collection, price, etc.). Unknown slugs are ignored. Remaining products follow, sorted by **`numericId` ascending**. **Does not** reorder collection/category pages. |

## How to get slugs for `productOrder`

1. Product URL path on the Wix site.  
2. `jay-stack action wixStoresV1/searchProducts` or `getProductBySlug` — read `slug` on each product.  
3. Match sequence to manual collection order in the Wix editor (same slugs, same order).

## Anti-patterns

- Using product **name**, **SKU**, or numeric id instead of **slug**.  
- Expecting `productOrder` on a **filtered** or **collection** listing.  
- Setting `productOrder` on a **large** catalog without understanding cost (see below).

## Performance

When `productOrder` is non-empty and the default listing uses manual order, `searchProducts` may **paginate the entire catalog** before returning one page. Setup warns when the catalog exceeds **200** products and `productOrder` is set. Consider caching or trimming `productOrder` for very large stores.

## Validation

- **Setup** — invalid `locale`, empty slugs, duplicate/unusual/unknown slugs (when the API is reachable).  
- **`jay-stack validate`** — same rules when `config/.wix-stores-v1.yaml` exists or a page imports `wix-stores-v1`.

## V3 comparison

| Feature | V3 (`wix-stores`) | V1 (this package) |
| ------- | ----------------- | ----------------- |
| Locale on cards | `config/.wix-stores.yaml` | `locale` here |
| Locale on PDP | Yes | Not yet |
| Manual grid order | Different API story | `productOrder` slugs only |
