# Wix Stores (Catalog V3) — store configuration

Project config for **Catalog V3** stores (`@jay-framework/wix-stores`). For Catalog V1, use `config/.wix-stores-v1.yaml` with `@jay-framework/wix-stores-v1`.

## File location

`config/.wix-stores.yaml` — created by `jay-stack setup wix-stores` when missing.

## Example

```yaml
urls:
  product: '/products/{slug}'
  category: '/products/{prefix}/{category}'

defaultCategory: 'all-products'

# BCP 47 — Wix dashboard → Settings → Language & region.
# Omit to keep API formatted prices on cards and product pages.
locale: 'ja-JP'
```

## Fields

| Field | Type | Values | Behavior |
| ----- | ---- | ------ | -------- |
| **`urls.product`** | string (required) | Path template starting with `/` | Canonical product links on cards and PDP. Must include **`{slug}`**. Optional **`{category}`**, **`{prefix}`** when the site uses category segments in product URLs. |
| **`urls.category`** | string or omitted | Path template with **`{category}`** (and often **`{prefix}`**) | Category deep-link URLs. Omit (`null`) when you do not have category listing pages. |
| **`defaultCategory`** | string (optional) | Category **slug** from the Wix category tree | Fallback when a page has no category context (for example related products). See `agent-kit/references/wix-stores/categories.yaml` after `jay-stack agent-kit`. |
| **`locale`** | string (optional) | BCP 47 tag, e.g. `he-IL`, `ja-JP`, `en-US` | Reformats prices on **product cards and product pages** via `Intl.NumberFormat` when currency is known. Unset = API `formattedAmount` strings. |

## URL placeholders

| Placeholder | Meaning |
| ----------- | ------- |
| `{slug}` | Product URL slug (required in `urls.product`) |
| `{category}` | Sub-category slug from the product’s main category |
| `{prefix}` | Root category slug in the category hierarchy |

Match templates to your real routes under `src/pages/`. Run `jay-stack agent-kit` for the live category tree and slugs.

## Anti-patterns

- Using **`{slug}`** in `urls.category` without a product context — category templates use **`{category}`** / **`{prefix}`**.  
- Setting **`urls.product`** with **`{category}`** or **`{prefix}`** but leaving **`urls.category`** unset while shipping category pages.  
- **`defaultCategory`** set to a display name instead of the category **slug**.  
- Mixing V3 config with the V1 plugin (`wix-stores-v1`) in the same project without separate config files.

## Validation

- **Setup** — invalid `locale`, bad URL templates, empty `defaultCategory`; unknown `defaultCategory` slug when the API is reachable.  
- **`jay-stack validate`** — same rules when `config/.wix-stores.yaml` exists or a page imports `@jay-framework/wix-stores` (not V1).

## Related agent-kit

- `agent-kit/references/wix-stores/categories.yaml` — category hierarchy (from `jay-stack agent-kit`)  
- `agent-kit/designer/related-products.md` — related products on PDP  
- Add Menu catalogs under `agent-kit/aiditor/add-menu/`

## V1 comparison

| Feature | V3 (this package) | V1 (`wix-stores-v1`) |
| ------- | ----------------- | -------------------- |
| Config file | `.wix-stores.yaml` | `.wix-stores-v1.yaml` |
| Locale | Cards + PDP | Cards only (PDP follow-up) |
| Manual grid order | API / sort | `productOrder` slug list |
| Categories | V3 category API | V1 collections |
