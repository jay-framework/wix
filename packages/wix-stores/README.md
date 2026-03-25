# @jay-framework/wix-stores

Wix Stores integration for Jay Framework using the Catalog V3 API. Provides headless full-stack components for product pages, search/listing, and category navigation with server-side rendering.

## Features

- **Catalog V3 API** - Uses `productsV3` and `@wix/categories` for product and category data
- **Three-phase rendering** - Slow (build/SSG), Fast (request/SSR), Interactive (client)
- **Category-prefixed routes** - Optional URL prefixes per product line (e.g., `/products/polgat/shirt-name`)
- **Unified search + category** - Single `product-search` component handles both search pages and category listings
- **Shared cart** - Delegates cart operations to `@jay-framework/wix-cart`

## Headless Components

### Product Page (`product-page`)

Complete product detail page with variant selection and add-to-cart.

- **Slow phase**: Product details, media gallery, options, SEO data
- **Fast phase**: Inventory status, pricing, variant availability
- **Interactive**: Option/modifier selection, quantity, add to cart

Route: `/products/[slug]` or `/products/[category]/[slug]` (when category prefixes are configured)

### Product Search (`product-search`)

Unified search and category listing component. Replaces the previous separate `category-page` component.

- **Slow phase**: Available categories for filtering
- **Fast phase**: Initial product results with price aggregations
- **Interactive**: Search input, category/price/stock filters, sorting, load more

When a `category` URL parameter is provided (e.g., from a route like `/products/polgat/`):

- Scopes all searches to products within that category hierarchy
- Shows only child categories of the root as filter options (root category is hidden)
- Enables per-category template designs via separate jay-html files

### Category List (`category-list`)

Lists all store categories for navigation.

## Configuration

### Basic Setup

The plugin requires `@jay-framework/wix-server-client` to be configured with Wix API credentials.

Run setup to create the config template:

```bash
jay-stack setup wix-stores
```

### Category Prefixes (Optional)

To enable category-prefixed product routes, create `config/.wix-stores.yaml`:

```yaml
categoryPrefixes:
  - categoryId: '024a9fff-77de-4508-b82c-5fce24f74757'
    prefix: 'polgat'
    name: 'פולגת'
  - categoryId: 'eac4db24-04cc-4f36-86cf-c9da6e873421'
    prefix: 'kitan'
    name: 'כיתן'
```

Each entry maps a root Wix category to a URL prefix. Products belonging to any child of the root category get URLs like `/products/{prefix}/{product-slug}`.

To find category IDs, run setup to generate the category tree reference:

```bash
jay-stack setup wix-stores
```

This creates `agent-kit/references/wix-stores/categories.yaml` with all category IDs, names, product counts, and parent-child relationships as a tree.

### Route Structure with Category Prefixes

```
src/pages/products/
├── page.jay-html                         # /products (default search, optional)
├── [slug]/page.jay-html                  # /products/:slug (default product page, optional)
├── polgat/
│   ├── page.jay-html                     # /products/polgat (polgat-design search)
│   └── [slug]/page.jay-html              # /products/polgat/:slug (polgat product page)
└── kitan/
    ├── page.jay-html                     # /products/kitan (kitan-design search)
    └── [slug]/page.jay-html              # /products/kitan/:slug (kitan product page)
```

Each prefix directory gets its own jay-html templates, enabling different visual designs per product line. Jay's routing precedence ensures static segments (`polgat`, `kitan`) take priority over the dynamic `[slug]` parameter.

Products without a matching category prefix fall back to `/products/[slug]` if that route exists, or return 404 if it doesn't.

## Server Actions

### `searchProducts`

Search products with filtering, sorting, and price aggregations.

```typescript
const results = await searchProducts({
  query: 'shoes',
  filters: { inStockOnly: true, categoryIds: ['cat-123'] },
  sortBy: 'price_asc',
  pageSize: 12,
});
```

CLI:

```bash
jay-stack action wix-stores/searchProducts
jay-stack action wix-stores/searchProducts --input '{"query": "shoes", "pageSize": 5}'
```

### `getProductBySlug`

Fetch a single product by its URL slug.

```typescript
const product = await getProductBySlug({ slug: 'blue-sneakers' });
```

CLI:

```bash
jay-stack action wix-stores/getProductBySlug --input '{"slug": "blue-sneakers"}'
```

### `getCategories`

Get all visible categories for filtering.

```typescript
const categories = await getCategories();
```

CLI:

```bash
jay-stack action wix-stores/getCategories
```

## Agent Kit References

Running `jay-stack setup wix-stores` or `jay-stack agent-kit` generates a category tree reference at `agent-kit/references/wix-stores/categories.yaml`. This file contains:

- All visible categories with IDs, names, slugs, and product counts
- Full parent-child hierarchy as a nested tree
- Configured category prefixes (if any) with their mapped category names

## Architecture

### Plugin Initialization

```
wix-server-client (init first)
  └── Registers WIX_CLIENT_SERVICE (API key auth)

wix-stores (init second)
  ├── Loads config/.wix-stores.yaml (category prefixes)
  ├── Registers WIX_STORES_SERVICE_MARKER (products, categories, inventory)
  └── Client: Registers WIX_STORES_CONTEXT (delegates cart to wix-cart)
```

### Category Prefix Resolution

When category prefixes are configured:

1. **`loadProductParams`** fetches all products with `ALL_CATEGORIES_INFO` and resolves each product's prefix
2. **`searchProducts`** includes `ALL_CATEGORIES_INFO` to generate correct prefixed URLs in results
3. **`mapProductToCard`** generates URLs like `/products/polgat/shirt-name` based on the product's category ancestry
4. **Product page** validates that the URL's category prefix matches the product's actual category

## Design Log

See [Design Log 10 - Category-Prefixed Product Routes](../../design-log/10%20-%20category-prefixed-product-routes.md) for the full design rationale.

## License

Apache-2.0
