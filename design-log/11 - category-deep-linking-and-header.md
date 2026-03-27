# 11 - Category Deep-Linking & Category Header

## Status: Draft

## Background

Design Log 10 introduced category-prefixed product routes (e.g., `/products/polgat/[slug]`). The `product-search` component supports scoping to a top-level category prefix, showing only its child categories as filters.

However, the current implementation lacks:
1. Deep-linking to a specific sub-category (e.g., `/products/polgat/shirts`)
2. Category metadata display (description, image, breadcrumbs) as a page header
3. Navigation between parent and child categories
4. Product URLs that include the sub-category context

### Available API Fields

**`getCategory(id, options)`** supports:
- `DESCRIPTION` — plain text description
- `RICH_CONTENT_DESCRIPTION` — rich content description
- `BREADCRUMBS_INFO` — breadcrumb trail from root to category

**`queryCategories(options)`** supports:
- `BREADCRUMBS_INFO` — breadcrumb info per category
- Filter by `parentCategory.id`, `slug`, `visible`, `name`, etc.

Category objects include: `_id`, `name`, `slug`, `visible`, `itemCounter`, `parentCategory._id`, `media` (with `mainMedia`), `description`, `breadcrumbsInfo.breadcrumbs[]`.

## Problem

1. Users can't navigate directly to a sub-category page
2. No category header (name, description, image, breadcrumbs) when viewing a category
3. Category filter items are checkboxes only — no way to deep-link
4. Product URLs don't include sub-category context for SEO

## URL Patterns Analysis

### The Three Page Types

| Page Type | What it shows | Component |
|-----------|--------------|-----------|
| **Top-level category** | All products in a category + child categories as filters | `product-search` |
| **Sub-category** | Products in a sub-category + header + breadcrumbs | `product-search` |
| **Product** | Single product detail page | `product-page` |

### URL Pattern Options

The site implementor chooses the URL pattern via filesystem routing. The headless components support all patterns — they receive params and don't impose URL structure.

**Pattern A: Sub-categories + products at different levels (no collision)**
```
/products/kitan/                              → top-level listing
/products/kitan/[subcategory]/                → sub-category listing
/products/kitan/[subcategory]/[slug]/         → product page
```
Products always have 3 segments. No collision. Products not directly under root category need a sub-category.

**Pattern B: Category marker prefix (no collision)**
```
/products/kitan/                              → top-level listing
/products/kitan/c/[subcategory]/              → sub-category listing
/products/kitan/[slug]/                       → product directly under category
/products/kitan/c/[subcategory]/[slug]/       → product under sub-category
```
Static `c/` prefix separates categories from products. Both levels support products.

**Pattern C: Shared level (collision risk)**
```
/products/kitan/                              → top-level listing
/products/kitan/[slug]/                       → product OR sub-category (collision)
/products/kitan/[subcategory]/[slug]/         → product under sub-category
```
Requires dual-component template at `[slug]` level. Slug collision risk between products and categories.

### Recommended: Pattern A

Pattern A is cleanest — no collision, no dual-component templates, deterministic routing. Products always include sub-category in their URL, which is better for SEO and navigation.

Trade-off: products directly assigned to the root category (not a sub-category) can't have a product page at `[slug]` level. They'd need to belong to at least one sub-category for URL generation.

The fs route structure for Pattern A:
```
src/pages/products/polgat/
├── page.jay-html                     → /products/polgat (top-level, product-search)
└── [subcategory]/
    ├── page.jay-html                 → /products/polgat/:subcategory (sub-category listing, product-search)
    └── [slug]/page.jay-html          → /products/polgat/:subcategory/:slug (product page, product-page)
```

## Questions and Answers

### Q1: How should routing avoid collisions?

**Answer: Use Pattern A — products always include sub-category.** Each route level serves exactly one purpose. The fs route structure is unambiguous. The site implementor chooses their pattern by creating the right directory structure.

### Q2: What should the category header show?

**Answer: Context-dependent.**
- **Top-level category** (`/products/polgat`) — root category's image, name, description
- **Sub-category** (`/products/polgat/shirts`) — sub-category's image, name, description, breadcrumbs
- **Top-level with filter** (`/products/polgat` + checkbox) — root category header with filter active

### Q3: How do product URLs include sub-category?

**Answer: Use `mainCategoryId`.** Each product has a `mainCategoryId` field — this is the canonical category for the product. The sub-category slug in the URL comes from this main category.

Resolution:
1. Get product's `mainCategoryId`
2. Look up that category's slug from the child categories map
3. Use it as `{subcategory}` in the URL template

This is deterministic — each product has exactly one canonical sub-category URL.

**Redirect for non-canonical URLs:** If a product page is accessed with a different sub-category slug than the one derived from `mainCategoryId`, the component should redirect (301) to the canonical URL. This prevents duplicate content and ensures consistent linking.

### Q4: What if a product's `mainCategoryId` is the root category itself?

If `mainCategoryId` points to the root (e.g., "polgat" itself rather than a child like "shirts"), the product has no sub-category context.

**Answer:** Fall back to a URL without `{subcategory}`. The `productUrl` template should handle this gracefully — if the template requires `{subcategory}` but none is available, the product is skipped (no page generated). If the template doesn't use `{subcategory}` (e.g., Pattern B), the product gets a page directly under the prefix.

### Q5: What category header data should the contract expose?

```yaml
categoryHeader:
  name: string
  description: string
  imageUrl: string
  hasImage: boolean
  productCount: number
  breadcrumbs: repeated
    categoryId: string
    name: string
    slug: string
    url: string        # full URL path for navigation
```

## Design

### URL Templates in Config

URL templates are **top-level** config fields (not per-prefix). They define how the component builds links for products and categories. This supports all three shop patterns:

```yaml
# config/.wix-stores.yaml

# URL patterns for link generation
urls:
  product: "/products/{slug}"         # how to link to a product page
  category: "/products/{category}"    # how to link to a category page (optional)
```

Available placeholders:
- `{slug}` — product slug
- `{category}` — category slug (from product's `mainCategoryId`)
- `{prefix}` — the matched category prefix (only when `categoryPrefixes` is configured)

### Three Supported Patterns

**Pattern 1 — Simple shop, no categories:**
```yaml
urls:
  product: "/products/{slug}"
```
Route: `products/[slug]/page.jay-html`

**Pattern 2 — Shop with categories, no prefixes:**
```yaml
urls:
  product: "/products/{category}/{slug}"
  category: "/products/{category}"
```
Route: `products/[category]/page.jay-html` + `products/[category]/[slug]/page.jay-html`

**Pattern 3 — Shop with category prefixes + sub-categories:**
```yaml
urls:
  product: "/products/{prefix}/{category}/{slug}"
  category: "/products/{prefix}/{category}"
categoryPrefixes:
  - categoryId: "024a9fff-..."
    prefix: "polgat"
    name: "פולגת"
  - categoryId: "eac4db24-..."
    prefix: "kitan"
    name: "כיתן"
```
Route: `products/polgat/[category]/page.jay-html` + `products/polgat/[category]/[slug]/page.jay-html`

When `urls` is not specified at all, defaults to `{ product: "/products/{slug}" }` (backward compatible, current behavior).

When `urls.category` is not specified, no category deep-linking is generated.

### Config Type

```typescript
interface WixStoresConfig {
    urls?: {
        /** URL template for product pages. Default: "/products/{slug}" */
        product?: string;
        /** URL template for category pages. Not set = no category pages */
        category?: string;
    };
    categoryPrefixes?: CategoryPrefixConfig[];
}

interface CategoryPrefixConfig {
    categoryId: string;
    prefix: string;
    name: string;
}
```

`CategoryPrefixConfig` no longer has URL fields — those are global in `urls`.

### Component Params

```typescript
interface ProductSearchParams extends UrlParams {
    category?: string;       // prefix slug (e.g., 'polgat') — existing
    subcategory?: string;    // sub-category slug (e.g., 'shirts') — NEW
}

interface ProductPageParams extends UrlParams {
    slug: string;
    category?: string;       // existing
    subcategory?: string;    // NEW — for URL generation and validation
}
```

### URL Generation

`mapProductToCard` uses the global URL template:

```typescript
function buildProductUrl(
    urlTemplate: string,    // from config.urls.product
    slug: string,
    categorySlug: string | null,
    prefix: string | null
): string {
    let url = urlTemplate;
    url = url.replace('{slug}', slug);
    if (categorySlug) url = url.replace('{category}', categorySlug);
    if (prefix) url = url.replace('{prefix}', prefix);
    return url;
}

function buildCategoryUrl(
    urlTemplate: string | null,  // from config.urls.category
    categorySlug: string,
    prefix: string | null
): string | null {
    if (!urlTemplate) return null;
    let url = urlTemplate;
    url = url.replace('{category}', categorySlug);
    if (prefix) url = url.replace('{prefix}', prefix);
    return url;
}
```

These functions are used by:
- `mapProductToCard` — for product links in search results and listings
- Category filter items — for `categoryUrl` deep-links
- Breadcrumb generation — for navigation links

`resolveProductSubcategory` uses the product's `mainCategoryId` to find the canonical sub-category:

```typescript
function resolveProductSubcategory(
    product: { mainCategoryId?: string },
    childCategories: Map<string, string>  // categoryId → slug
): string | null {
    if (!product.mainCategoryId) return null;
    return childCategories.get(product.mainCategoryId) ?? null;
}
```

The `childCategories` map is built once during slow phase by querying direct children of each prefix root. If `mainCategoryId` is not a direct child (e.g., it's a grandchild or the root itself), the sub-category is null.

### Product Page — Canonical URL Redirect

When the product page component receives a `subcategory` param that doesn't match the product's canonical sub-category (derived from `mainCategoryId`), it issues a 301 redirect:

```typescript
async function renderSlowlyChanging(props, wixStores) {
    const product = await wixStores.products.getProductBySlug(props.slug, { fields });

    // Resolve canonical subcategory from mainCategoryId
    const canonicalSubcategory = resolveProductSubcategory(product, childCategories);

    // Redirect if accessed via non-canonical subcategory
    if (props.subcategory && canonicalSubcategory && props.subcategory !== canonicalSubcategory) {
        const canonicalUrl = buildProductUrl(prefixConfig, product.slug, canonicalSubcategory);
        return Pipeline.redirect(301, canonicalUrl);
    }
}
```

### Slow Render — Category Header

When `subcategory` is set:
1. Query category by slug: `queryCategories().eq('slug', subcategory).find()`
2. Load details via `getCategory(id, { fields: ['DESCRIPTION', 'BREADCRUMBS_INFO'] })`
3. Use sub-category ID as base filter
4. Load filter categories as children of the sub-category (or siblings)
5. Build breadcrumb URLs

When only `category` is set:
- Load root category details for header
- Existing filter behavior unchanged

### SSG Param Loading

**Product params** (`loadProductParams`):
```typescript
// Yields { category: 'polgat', subcategory: 'shirts', slug: 'product-slug' }
// for products that belong to a configured prefix's sub-category
```

**Search/category params** (`loadSearchParams` — new):
```typescript
// Yields { category: 'polgat', subcategory: 'shirts' }
// for each child category of each configured prefix
```

### Contract Additions

Add to `product-search.jay-contract`:

```yaml
- tag: categoryHeader
  type: sub-contract
  description: Active category information for the page header
  tags:
    - tag: name
      type: data
      dataType: string
    - tag: description
      type: data
      dataType: string
    - tag: imageUrl
      type: data
      dataType: string
    - tag: hasImage
      type: variant
      dataType: boolean
    - tag: productCount
      type: data
      dataType: number
    - tag: breadcrumbs
      type: sub-contract
      repeated: true
      trackBy: categoryId
      tags:
        - tag: categoryId
          type: data
          dataType: string
        - tag: name
          type: data
          dataType: string
        - tag: slug
          type: data
          dataType: string
        - tag: url
          type: data
          dataType: string

- tag: hasCategoryHeader
  type: variant
  dataType: boolean
```

Add `categoryUrl` to category filter items:
```yaml
- tag: categoryUrl
  type: data
  dataType: string
  description: Deep-link URL to sub-category page
```

### Route Structure (Golf Example — Pattern A)

```
src/pages/products/
├── page.jay-html                                → /products (all products)
├── [slug]/page.jay-html                         → /products/:slug (uncategorized product)
├── polgat/
│   ├── page.jay-html                            → /products/polgat (top-level, with header)
│   └── [subcategory]/
│       ├── page.jay-html                        → /products/polgat/:subcategory (sub-category listing)
│       └── [slug]/page.jay-html                 → /products/polgat/:subcategory/:slug (product page)
└── kitan/
    ├── page.jay-html                            → /products/kitan (top-level, with header)
    └── [subcategory]/
        ├── page.jay-html                        → /products/kitan/:subcategory (sub-category listing)
        └── [slug]/page.jay-html                 → /products/kitan/:subcategory/:slug (product page)
```

Each level has exactly one purpose. No collisions. No dual-component templates.

## Implementation Plan

### Phase 1: Contract & Types
1. Add `categoryHeader`, `hasCategoryHeader`, `categoryUrl` to contract
2. Update generated `.d.ts` types

### Phase 2: Sub-category Resolution
1. Add `subcategory` param to `ProductSearchParams` and `ProductPageParams`
2. Build child category lookup (categoryId → slug map) during slow phase
3. Update `mapProductToCard` to include subcategory in URLs
4. Update `loadProductParams` to yield `{ category, subcategory, slug }`

### Phase 3: Category Header Loading
1. In slow render: load category details when `category` or `subcategory` is set
2. Build breadcrumb trail with correct URLs
3. Generate `categoryUrl` for each filter category item

### Phase 4: SSG Param Loading
1. Add `loadSearchParams` to yield sub-category slugs for SSG
2. Wire into the component definition

### Phase 5: Example Templates
1. Add sub-category route structure to golf example
2. Add category header sections to listing pages
3. Add deep-link URLs to category filter items

## Trade-offs

### Pros
- **Unified config**: One `urls` section covers all three shop patterns (no categories, categories, prefixes + sub-categories)
- **No collisions**: URL pattern is explicit in config, each route level has one purpose
- **Clean URLs**: `/products/polgat/shirts/blue-shirt` reads naturally
- **SEO-friendly**: Sub-category and canonical redirects prevent duplicate content
- **Backward compatible**: Without `urls` in config, defaults to `/products/{slug}` (current behavior)
- **Config-driven**: URL structure is declarative, not hardcoded in components
- **Canonical URLs**: `mainCategoryId` ensures each product has exactly one canonical URL

### Cons
- **Products need category** (when template uses `{category}`): Products without a `mainCategoryId` matching a known category can't have pages
- **Deeper URL paths**: 3 segments for products vs current 2 (when using `{prefix}/{category}/{slug}`)
- **Child category lookup**: Extra query to build categoryId→slug map
- **More routes**: Each category generates its own listing page
- **URL template understanding**: Site implementor must understand `{slug}`, `{category}`, `{prefix}` placeholders