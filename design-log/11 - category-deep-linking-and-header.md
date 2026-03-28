# 11 - Category Deep-Linking & Category Header

## Status: Draft

## Background

Design Log 10 introduced category-prefixed product routes. The `product-search` component supports scoping to a top-level category, showing child categories as filters. However it lacks sub-category deep-linking, category metadata display (image, description, breadcrumbs, SEO), and configurable URL patterns.

## The Three URL Parameters

Every URL in a category-aware store can be built from three parameters:

| Param | Source | Example |
|-------|--------|---------|
| `{prefix}` | Top-level category slug (from Wix API, category ID in config) | `polgat`, `kitan` |
| `{category}` | Sub-category slug (from Wix API, resolved from `mainCategoryId`) | `shirts`, `bedroom` |
| `{slug}` | Product slug (from Wix API) | `blue-shirt`, `cotton-sheets` |

These three params combine into URL patterns. The site implementor chooses their pattern via:
1. **Filesystem routes** — which directories and `[param]` folders to create
2. **URL config** — how the component builds canonical links

## URL Pattern Catalog

| Pattern | Product URL | Category URL | Top-Level URL | Use Case |
|---------|------------|--------------|---------------|----------|
| Flat | `/products/{slug}` | — | — | Simple store, no categories |
| Categories only | `/products/{category}/{slug}` | `/products/{category}` | — | Categories without top-level prefixes |
| Prefix + flat | `/products/{prefix}/{slug}` | — | `/products/{prefix}` | DL10 current behavior |
| Prefix + categories | `/products/{prefix}/{category}/{slug}` | `/products/{prefix}/{category}` | `/products/{prefix}` | Full setup |
| Custom paths | `/{prefix}/{category}/{slug}` | `/{prefix}/{category}` | `/{prefix}` | No `/products` prefix |

These are common patterns — any combination of `{prefix}`, `{category}`, and `{slug}` is possible. The headless components receive params and don't impose URL structure. The site implementor is free to create any pattern that fits their needs.

### Static overrides via Jay routing

Jay's filesystem routing supports **static segments that override dynamic params**. This enables per-prefix, per-category, and per-product template overrides:

**Per-prefix override** — different design for a specific top-level category:
```
src/pages/products/
├── [prefix]/
│   └── page.jay-html                     → default design for any prefix
├── polgat/
│   └── page.jay-html                     → custom design only for polgat
```

**Per-category override** — special page for a specific sub-category:
```
src/pages/products/polgat/
├── [category]/
│   └── page.jay-html                     → default sub-category design
├── sale/
│   └── page.jay-html                     → custom design for the "sale" sub-category
```

**Per-product override** — dedicated page for a featured product:
```
src/pages/products/polgat/shirts/
├── [slug]/page.jay-html                  → default product page
├── premium-oxford/page.jay-html          → custom page for one specific product
```

In each case, the static directory takes routing precedence over the dynamic `[param]` directory. The override template can use `jay-params` to set the param value explicitly, or bind a completely different set of components.

**Combining dynamic and static at multiple levels:**
```
src/pages/products/
├── page.jay-html                                    → /products (all products search)
├── [prefix]/
│   ├── page.jay-html                                → /products/:prefix (dynamic prefix)
│   └── [category]/
│       ├── page.jay-html                            → /products/:prefix/:category
│       └── [slug]/page.jay-html                     → /products/:prefix/:category/:slug
├── polgat/
│   ├── page.jay-html                                → /products/polgat (static override)
│   ├── shirts/
│   │   └── page.jay-html                            → /products/polgat/shirts (static override)
│   └── [category]/
│       ├── page.jay-html                            → /products/polgat/:category (other categories)
│       └── [slug]/page.jay-html                     → /products/polgat/:category/:slug
└── kitan/
    ├── page.jay-html                                → /products/kitan (static override)
    └── [category]/
        ├── page.jay-html                            → /products/kitan/:category
        └── [slug]/page.jay-html                     → /products/kitan/:category/:slug
```

This enables a fully generic `[prefix]` route for categories that don't need custom designs, alongside static overrides (`polgat/`, `kitan/`) for categories that do — all coexisting in the same route tree.

## Do We Need `categoryPrefixes` Config?

**No.** Each concern it addressed is already handled by other mechanisms:

### Template routing → Filesystem routes + jay-params
Creating `src/pages/products/polgat/page.jay-html` with `<script type="application/jay-params">category: polgat</script>` IS the configuration. The route defines the page, the jay-params tells the component which category to scope to. No config file needed.

### Root scoping → Component receives category param from route
The component receives `props.category` (from jay-params or URL param). It looks up the category by slug via the Wix API. If found, scopes to it. No pre-configured IDs needed.

### Product URL generation → Walk the category tree from API
When `{prefix}` is in the URL template, the component resolves it at build time by walking up from the product's `mainCategoryId` to find the root category. Uses the root's slug as `{prefix}`. Discovered from the API, not config.

### Which categories are "roots"? → Routes decide
The site implementor creates routes for the categories they want. Products with root categories that don't have matching routes simply don't get pages (no route = no page generated by the framework). No config needed to "select" root categories.

**Conclusion:** The only remaining config is `urls` — how to build canonical links. Everything else comes from filesystem routes + Wix API.

## Config Structure

```yaml
# config/.wix-stores.yaml

# URL templates for link generation (how the component builds <a href="...">)
urls:
  product: "/products/{slug}"          # default, no categories in URL
  category: null                       # no category deep-linking by default
```

That's it. No `categoryPrefixes`. The filesystem routes and jay-params handle everything else.

### Example configs for each pattern:

**Simple store (no categories in URLs):**
```yaml
urls:
  product: "/products/{slug}"
```

**Categories in URLs (no top-level prefixes):**
```yaml
urls:
  product: "/products/{category}/{slug}"
  category: "/products/{category}"
```

**Top-level prefix + flat products:**
```yaml
urls:
  product: "/products/{prefix}/{slug}"
```

**Top-level prefix + sub-categories (full setup):**
```yaml
urls:
  product: "/products/{prefix}/{category}/{slug}"
  category: "/products/{prefix}/{category}"
```

### Config Type

```typescript
interface WixStoresConfig {
    urls?: {
        /** URL template for product pages. Default: "/products/{slug}" */
        product?: string;
        /** URL template for category pages. Not set = no category pages */
        category?: string;
    };
    /** Slug of the fallback category for pages without category context */
    defaultCategory?: string;
}
```

### How the component discovers category data

The component resolves category information using a **fallback chain** with inheritance:

**Resolution order:**
1. **`subcategory` param** — if set, load the sub-category by slug
2. **`category` / `prefix` param** — if set, load the root category by slug
3. **`defaultCategory` from config** — fallback for pages without category context (e.g., `/products` with no prefix)

```yaml
# config/.wix-stores.yaml
urls:
  product: "/products/{prefix}/{category}/{slug}"
  category: "/products/{prefix}/{category}"
defaultCategory: "all-products"   # slug of the fallback category
```

**Metadata inheritance:** If the resolved category doesn't have image, description, or SEO data, the component walks up the **parent chain** until it finds the data:
- Sub-category missing image → check parent category → check grandparent → ... → check default category
- Each field (image, description, SEO) inherits independently

This means a sub-category page can inherit the parent category's hero image while showing its own name and description, and a deeply nested category inherits from its nearest ancestor that has the data.

**For product URL generation**, when `{prefix}` or `{category}` are in the template:
1. Fetches product with `ALL_CATEGORIES_INFO`
2. Uses `mainCategoryId` to resolve `{category}` slug
3. Walks up the parent chain to find the root category for `{prefix}` slug
4. All data comes from the API — no config mapping needed

## Component Design

### Three Params in Components

```typescript
interface ProductSearchParams extends UrlParams {
    category?: string;       // prefix slug (e.g., 'polgat') — resolved from URL or jay-params
    subcategory?: string;    // sub-category slug (e.g., 'shirts') — from [category] route param
}

interface ProductPageParams extends UrlParams {
    slug: string;            // product slug
    category?: string;       // prefix slug
    subcategory?: string;    // sub-category slug — for canonical URL validation
}
```

### URL Generation

Two functions, driven by config templates:

```typescript
function buildProductUrl(template: string, slug: string, categorySlug: string | null, prefix: string | null): string {
    let url = template;
    url = url.replace('{slug}', slug);
    if (categorySlug) url = url.replace('{category}', categorySlug);
    if (prefix) url = url.replace('{prefix}', prefix);
    // If any placeholder remains unresolved, return null (product can't be linked)
    return url.includes('{') ? null : url;
}

function buildCategoryUrl(template: string | null, categorySlug: string, prefix: string | null): string | null {
    if (!template) return null;
    let url = template;
    url = url.replace('{category}', categorySlug);
    if (prefix) url = url.replace('{prefix}', prefix);
    return url.includes('{') ? null : url;
}
```

### Canonical URLs & Redirects

The `urls` config defines what the canonical URL looks like. The component enforces canonical URLs via 301 redirects when a page is accessed at a non-canonical path.

**Product canonical URL:**
- Determined by `urls.product` template + product's `mainCategoryId` (for `{category}`) + root category (for `{prefix}`)
- The product is identified by its **slug** — that's the lookup key
- If the URL has the wrong `{category}` or `{prefix}` for this product, redirect 301 to the canonical URL

Example: product "blue-shirt" has `mainCategoryId` pointing to "shirts" under "polgat"
- Canonical: `/products/polgat/shirts/blue-shirt`
- `/products/polgat/pants/blue-shirt` → 301 redirect (wrong category)
- `/products/kitan/shirts/blue-shirt` → 301 redirect (wrong prefix)

**Category canonical URL:**
- Determined by `urls.category` template + category's slug + parent chain (for `{prefix}`)
- The category is identified by its **slug** — that's the lookup key
- If the URL has the wrong `{prefix}` for this category, redirect 301 to the canonical URL

Example: category "shirts" is a child of "polgat"
- Canonical: `/products/polgat/shirts`
- `/products/kitan/shirts` → 301 redirect (wrong prefix)

### Category Header

The category header is **always loaded**. The `product-search` component always resolves a category for the header using the fallback chain:

1. `subcategory` param → load sub-category
2. `category` / `prefix` param → load root category
3. Neither → load `defaultCategory` from config

**Data loaded via `getCategory(id, { fields: ['DESCRIPTION', 'BREADCRUMBS_INFO'] })`:**
- Name, description, image URL (with parent chain inheritance for missing fields)
- Product count
- Breadcrumb trail (with URLs built from config template)
- SEO data

**Behavior:**
- `/products/polgat/shirts` — sub-category header (name: "shirts", breadcrumbs: polgat > shirts)
- `/products/polgat` — root category header (name: "polgat")
- `/products` — default category header (from `defaultCategory` config, e.g., "all-products")
- Filter checkbox selected — header unchanged, only products filtered

### SSG Param Loading

**Product params** — `loadProductParams` (existing, extended):
```
Yields: { slug, category (prefix), subcategory (from mainCategoryId) }
```

**Category params** — `loadSearchParams` (new):
```
Yields: { category (prefix), subcategory (child category slug) }
for each direct child of each configured prefix root
```

## Contract Additions

### Category Header

```yaml
  - tag: categoryHeader
    type: sub-contract
    description: Active category information for the page header. Populated when navigating to a category via URL.
    tags:
      - {tag: name, type: data, dataType: string, description: Category display name}
      - {tag: description, type: data, dataType: string, description: Category plain text description}
      - {tag: imageUrl, type: data, dataType: string, description: Category main image URL}
      - {tag: hasImage, type: variant, dataType: boolean, description: Whether category has an image}
      - {tag: productCount, type: data, dataType: number, description: Number of products in category}

      - tag: breadcrumbs
        type: sub-contract
        repeated: true
        trackBy: categoryId
        description: Breadcrumb trail from root to current category
        tags:
          - {tag: categoryId, type: data, dataType: string, description: Category GUID}
          - {tag: name, type: data, dataType: string, description: Category name}
          - {tag: slug, type: data, dataType: string, description: Category slug}
          - {tag: url, type: data, dataType: string, description: Full URL path for breadcrumb navigation}

      - tag: seoData
        type: sub-contract
        description: Category SEO metadata. Only populated when category is selected via URL.
        tags:
          - tag: tags
            type: sub-contract
            repeated: true
            trackBy: position
            description: SEO tag information
            tags:
              - {tag: position, type: data, dataType: string, description: Tag position as two digit string}
              - {tag: type, type: data, dataType: string, description: SEO tag type}
              - tag: props
                type: sub-contract
                repeated: true
                trackBy: key
                description: Key-value pair of SEO properties
                tags:
                  - {tag: key, type: data, dataType: string}
                  - {tag: value, type: data, dataType: string}
              - tag: meta
                type: sub-contract
                repeated: true
                trackBy: key
                description: SEO tag metadata
                tags:
                  - {tag: key, type: data, dataType: string}
                  - {tag: value, type: data, dataType: string}
              - {tag: children, type: data, dataType: string, description: SEO tag inner content}
          - tag: settings
            type: sub-contract
            description: SEO general settings
            tags:
              - {tag: preventAutoRedirect, type: data, dataType: boolean, description: Whether auto-redirect from old URL is enabled}
              - tag: keywords
                type: sub-contract
                repeated: true
                trackBy: term
                description: User-selected keyword terms
                tags:
                  - {tag: term, type: data, dataType: string, description: Keyword value}
                  - {tag: isMain, type: data, dataType: boolean, description: Whether this is the main focus keyword}
                  - {tag: origin, type: data, dataType: string, description: Source that added the keyword}

```

Note: `hasCategoryHeader` is not needed — the header is always populated (fallback to `defaultCategory`).

### Category Filter Deep-Link

Add to existing `filters.categoryFilter.categories` items:

```yaml
        - tag: categoryUrl
          type: data
          dataType: string
          description: Deep-link URL to this category's dedicated page (built from urls.category template)
```

## Implementation Plan

### Phase 1: Config — URL Templates
1. Add `urls` section to `WixStoresConfig` type and config loader
2. Remove `categoryPrefixes` from config (replaced by routes + jay-params + API)
3. Add `buildProductUrl` and `buildCategoryUrl` utility functions
4. Update `mapProductToCard` to use URL templates
5. Default to `"/products/{slug}"` when not configured

### Phase 2: Contract & Types
1. Add `categoryHeader`, `hasCategoryHeader` to `product-search.jay-contract`
2. Add `categoryUrl` to category filter items
3. Update generated `.d.ts` types

### Phase 3: Category Discovery from API
1. Component resolves category by slug from route param (no config lookup)
2. Build child category lookup (categoryId → slug) during slow phase
3. Walk parent chain to resolve `{prefix}` from root category
4. Resolve `{category}` from product's `mainCategoryId`
5. Implement canonical URL redirect for non-canonical subcategory

### Phase 4: Category Header Loading
1. Load category details via `getCategory(id, { fields: ['DESCRIPTION', 'BREADCRUMBS_INFO'] })`
2. Build breadcrumb URLs using config templates
3. Expose header data through contract

### Phase 5: SSG
1. Extend `loadProductParams` to yield prefix + subcategory params
2. Add `loadSearchParams` for sub-category pages
3. Filter out empty categories (`itemCounter === 0`)

### Phase 6: Filter State in URL
1. Parse query params in fast render to set initial filter state
2. Apply parsed filters to initial `searchProducts` call
3. In interactive phase, update URL query string on filter changes (replaceState)
4. Use slugs/values in params, not internal IDs

### Phase 7: README & Documentation
1. Update wix-stores README with all URL patterns, config options, route examples
2. Document category header, filter URL persistence, canonical redirects
3. Include setup instructions and jay-params usage

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `mainCategoryId` changes → product URL changes | Broken links, SEO impact | 301 redirect from old URL; flat URL pattern avoids this entirely |
| Unresolved `{placeholder}` in URL | Broken links | `buildProductUrl` returns null, product skipped with warning |
| Config-route mismatch | Links point to 404 | Document clearly; future: setup validates |
| Empty categories generate pages | Bad SEO | `loadSearchParams` skips `itemCounter === 0` |
| No multi-level nesting | Deep trees not navigable | Acceptable for now; future work |

## Filter State in URL Query Parameters

Filters should be persisted in the URL as query parameters so that:
- Users can share/bookmark a filtered view
- Back button restores the previous filter state
- Search engines can index filtered views (optional)

### Query Parameter Schema

| Filter | Query Param | Format | Example |
|--------|------------|--------|---------|
| Search term | `q` | string | `?q=cotton` |
| Category filter | `cat` | comma-separated slugs | `?cat=shirts,pants` |
| Min price | `min` | number | `?min=50` |
| Max price | `max` | number | `?max=200` |
| In stock only | `inStock` | `1` | `?inStock=1` |
| Sort | `sort` | enum value | `?sort=priceAsc` |

All values use **slugs or display values**, not internal IDs. This makes URLs readable and stable across API changes.

Full example: `/products/polgat?q=cotton&cat=shirts&min=50&max=200&sort=priceAsc`

### Saving Filters to URL

In the **interactive phase**, when a filter changes, the component updates the URL query string without triggering a page reload:

```typescript
// On filter change → update URL
function updateUrlFilters(filters, searchTerm, sort) {
    const params = new URLSearchParams();
    if (searchTerm) params.set('q', searchTerm);

    const selectedCategories = filters.categoryFilter.categories
        .filter(c => c.isSelected)
        .map(c => c.categorySlug);  // use slugs, not IDs
    if (selectedCategories.length) params.set('cat', selectedCategories.join(','));

    if (filters.priceRange.minPrice > filters.priceRange.minBound) params.set('min', String(filters.priceRange.minPrice));
    if (filters.priceRange.maxPrice < filters.priceRange.maxBound) params.set('max', String(filters.priceRange.maxPrice));
    if (filters.inStockOnly) params.set('inStock', '1');
    if (sort !== 'relevance') params.set('sort', sort);

    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}
```

### Restoring Filters from URL

In the **fast render phase** (SSR), the component reads query parameters from `props.url` and applies them as the initial filter state:

```typescript
function parseUrlFilters(url: string, categories: CategoryInfos): InitialFilters {
    const params = new URL(url, 'http://x').searchParams;

    return {
        searchTerm: params.get('q') || '',
        selectedCategorySlugs: params.get('cat')?.split(',') || [],
        minPrice: params.has('min') ? Number(params.get('min')) : null,
        maxPrice: params.has('max') ? Number(params.get('max')) : null,
        inStockOnly: params.get('inStock') === '1',
        sort: params.get('sort') || 'relevance',
    };
}
```

The fast render uses these parsed values to:
1. Set `searchExpression` initial value
2. Pre-select category checkboxes (match slugs to category data)
3. Set price range slider positions
4. Set inStockOnly checkbox
5. Set sort dropdown value
6. Execute the initial `searchProducts` call with these filters applied

This means a URL like `/products/polgat?cat=shirts&min=50&sort=priceAsc` renders server-side with the filters already applied — no flash of unfiltered content.

## Scope Limitations

- **Single level of sub-categories only.** Only direct children of the root category are supported as sub-categories. If `mainCategoryId` points to a grandchild, the product is skipped.
- **No category arrangement.** Product ordering within a category uses `searchProducts` default order, not Wix's custom category arrangement.
