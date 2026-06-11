# @jay-framework/wix-stores

Wix Stores integration for Jay Framework using the Catalog V3 API. Provides headless full-stack components for product pages, search/listing, and category navigation with server-side rendering.

## Features

- **Catalog V3 API** — Uses `productsV3` and `@wix/categories` for product and category data
- **Three-phase rendering** — Slow (build/SSG), Fast (request/SSR), Interactive (client)
- **Flexible URL patterns** — Configurable URL templates with `{prefix}`, `{category}`, `{slug}` placeholders
- **Category header** — Automatic category metadata (name, description, image, breadcrumbs, SEO)
- **Filter URL persistence** — Filters saved to query params for sharable, bookmarkable URLs
- **Canonical redirects** — 301 redirects for non-canonical product/category URLs
- **Shared cart** — Delegates cart operations to `@jay-framework/wix-cart`

## Headless Components

### Product Page (`product-page`)

Complete product detail page with variant selection and add-to-cart.

- **Slow phase**: Product details, media gallery, options, SEO data
- **Fast phase**: Inventory status, pricing, variant availability
- **Interactive**: Option/modifier selection, quantity, add to cart

### Product Search (`product-search`)

Unified search, category listing, and product browsing component.

- **Slow phase**: Category header (name, description, image, breadcrumbs, SEO), available categories for filtering
- **Fast phase**: Initial product results with price aggregations, filters restored from URL query params
- **Interactive**: Search input, category/price/stock filters, sorting, load more, filter URL persistence

Supports three roles depending on route params:

- **Search page** — no category context, shows all products
- **Top-level category page** — scoped to a root category, shows child categories as filters
- **Sub-category page** — scoped to a sub-category, shows header with breadcrumbs

### Category List (`category-list`)

Lists all store categories for navigation.

## Configuration

### Setup

The plugin requires `@jay-framework/wix-server-client` to be configured with Wix API credentials.

```bash
jay-stack setup wix-stores
```

This creates `config/.wix-stores.yaml` and writes static AIditor Add Menu component items to `agent-kit/aiditor/add-menu/wix-stores.yaml`.

Run `jay-stack agent-kit` (or `yarn agent-kit`) to index the live category tree and refresh:

- `agent-kit/references/wix-stores/categories.yaml` — full hierarchy for agent discovery
- `agent-kit/aiditor/add-menu/wix-stores.generated.yaml` — one Add Menu item per category (Store → Categories)

### Config File (`config/.wix-stores.yaml`)

```yaml
# URL templates — how the component builds canonical links
urls:
  product: '/products/{slug}' # default
  category: null # no category pages by default

# Fallback category for pages without category context
defaultCategory: 'all-products' # slug of the fallback category
```

URL templates use three placeholders:

| Placeholder  | Source                                     | Description               |
| ------------ | ------------------------------------------ | ------------------------- |
| `{slug}`     | Wix product slug                           | Product identifier in URL |
| `{category}` | Wix category slug (from `mainCategoryId`)  | Sub-category in URL       |
| `{prefix}`   | Wix root category slug (from parent chain) | Top-level category in URL |

## URL Patterns

### Pattern 1: Simple Store (No Categories)

```yaml
urls:
  product: '/products/{slug}'
```

```
src/pages/products/
├── page.jay-html              → /products (search page)
└── [slug]/page.jay-html       → /products/:slug (product page)
```

### Pattern 2: Categories (No Top-Level Prefixes)

```yaml
urls:
  product: '/products/{category}/{slug}'
  category: '/products/{category}'
```

```
src/pages/products/
├── page.jay-html              → /products (all products)
└── [category]/
    ├── page.jay-html          → /products/:category (category listing)
    └── [slug]/page.jay-html   → /products/:category/:slug (product)
```

### Pattern 3: Top-Level Prefixes + Sub-Categories

```yaml
urls:
  product: '/products/{prefix}/{category}/{slug}'
  category: '/products/{prefix}/{category}'
defaultCategory: 'all-products'
```

```
src/pages/products/
├── page.jay-html                                → /products (all products)
├── [prefix]/
│   ├── page.jay-html                            → /products/:prefix (generic prefix page)
│   └── [category]/
│       ├── page.jay-html                        → /products/:prefix/:category (sub-category)
│       └── [slug]/page.jay-html                 → /products/:prefix/:category/:slug (product)
├── polgat/
│   ├── page.jay-html                            → /products/polgat (custom design)
│   └── [category]/
│       ├── page.jay-html                        → /products/polgat/:category
│       └── [slug]/page.jay-html                 → /products/polgat/:category/:slug
└── kitan/
    ├── page.jay-html                            → /products/kitan (custom design)
    └── [category]/
        ├── page.jay-html                        → /products/kitan/:category
        └── [slug]/page.jay-html                 → /products/kitan/:category/:slug
```

Static directories (`polgat/`, `kitan/`) override the dynamic `[prefix]/` route, enabling different template designs per category. Any other prefix falls through to `[prefix]/`.

### Static Overrides

Jay's routing supports static segments overriding dynamic params at any level:

```
src/pages/products/polgat/
├── [category]/page.jay-html          → default sub-category design
├── sale/page.jay-html                → custom design for "sale" sub-category
└── [category]/
    ├── [slug]/page.jay-html          → default product page
    └── premium-oxford/page.jay-html  → custom page for one specific product
```

### Setting Params for Static Routes

Static route directories use `jay-params` to tell the component which prefix they represent:

```html
<!-- src/pages/products/polgat/page.jay-html -->
<script type="application/jay-params">
  prefix: polgat
</script>
<script
  type="application/jay-headless"
  plugin="@jay-framework/wix-stores"
  contract="product-search"
  key="search"
></script>
```

## Category Header

The category header is always loaded. The component resolves category metadata using a fallback chain:

1. **`category` param** → load category
2. **`prefix` param** → load root category
3. **Neither** → load `defaultCategory` from config

If the resolved category is missing image, description, or SEO data, the component walks up the parent chain until it finds the data. Each field inherits independently.

The header includes:

- Category name and description
- Category image
- Product count
- Breadcrumb trail with navigation URLs
- SEO metadata (title tags, meta description, keywords)

## Filter URL Persistence

Filters are persisted in URL query parameters for sharable, bookmarkable URLs:

| Filter          | Query Param | Example             |
| --------------- | ----------- | ------------------- |
| Search term     | `q`         | `?q=cotton`         |
| Category filter | `cat`       | `?cat=shirts,pants` |
| Min price       | `min`       | `?min=50`           |
| Max price       | `max`       | `?max=200`          |
| In stock only   | `inStock`   | `?inStock=1`        |
| Sort            | `sort`      | `?sort=priceAsc`    |

All values use slugs/display values, not internal IDs.

Example: `/products/polgat?q=cotton&cat=shirts&min=50&sort=priceAsc`

- **Saving**: On filter change, the URL is updated via `replaceState` (no page reload)
- **Restoring**: On page load (SSR), query params are parsed and applied as the initial filter state. The server-rendered page shows filtered results immediately.

## Canonical URLs & Redirects

The `urls` config defines canonical URLs. If a page is accessed at a non-canonical path, the component issues a 301 redirect.

**Products:** Identified by slug. The canonical `{category}` comes from `mainCategoryId`, and `{prefix}` from the root category. Wrong category or prefix in the URL → 301 redirect.

**Categories:** Identified by slug. The canonical `{prefix}` comes from the parent chain. Wrong prefix in the URL → 301 redirect.

## Server Actions

### `searchProducts`

```bash
jay-stack action wix-stores/searchProducts
jay-stack action wix-stores/searchProducts --input '{"query": "shoes", "pageSize": 5}'
```

### `getProductBySlug`

```bash
jay-stack action wix-stores/getProductBySlug --input '{"slug": "blue-sneakers"}'
```

### `getCategories`

```bash
jay-stack action wix-stores/getCategories
```

## Agent Kit References

Running `jay-stack setup wix-stores` generates `agent-kit/references/wix-stores/categories.yaml` — the full category tree with IDs, names, slugs, product counts, and parent-child hierarchy.

## Design Logs

- [Design Log 10 - Category-Prefixed Product Routes](../../design-log/10%20-%20category-prefixed-product-routes.md)
- [Design Log 11 - Category Deep-Linking & Header](../../design-log/11%20-%20category-deep-linking-and-header.md)

## License

Apache-2.0
