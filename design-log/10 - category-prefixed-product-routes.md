# 10 - Category-Prefixed Product Routes

## Status: Draft

## Background

The `wix-stores` package (Catalog V3) currently generates product URLs as `/products/[slug]`. Some stores need URLs like `/products/polgat/[slug]` and `/products/kitan/[slug]`, where the prefix represents a top-level product line (brand/division) derived from the Wix category hierarchy.

### Current State

**Product URL generation** (`product-mapper.ts`):
```typescript
const DEFAULT_PRODUCT_PAGE_PATH = '/products';
productUrl: slug ? `${productPagePath}/${slug}` : ''
```

**SSG param loading** (`product-page.ts`):
```typescript
async function* loadProductParams([wixStores]): AsyncIterable<ProductPageParams[]> {
    let result = await wixStores.products.queryProducts().find();
    yield result.items.map((product) => ({ slug: product.slug }));
}
```

**Jay fs-route routing** supports static segments overriding dynamic params:
```
src/pages/products/polgat/[slug]/page.jay-html   → /products/polgat/:slug  (static prefix, wins)
src/pages/products/kitan/[slug]/page.jay-html     → /products/kitan/:slug   (static prefix, wins)
src/pages/products/[slug]/page.jay-html           → /products/:slug         (fallback)
```

### The Specific Use Case

Two Wix categories serve as top-level product lines:
- `024a9fff-...` → slug prefix `polgat` (Hebrew name: פולגת)
- `eac4db24-...` → slug prefix `kitan` (Hebrew name: כיתן)

A product belongs to a product line if **any of its categories** (via `allCategoriesInfo.categories`) includes the root category ID. The `allCategoriesInfo` field is only available with the `ALL_CATEGORIES_INFO` field flag on `getProduct()` / `searchProducts()`.

The slug prefix names (`polgat`, `kitan`) are **custom** — they don't come from the Wix category data directly.

## Problem

1. Product URLs need a category-based prefix segment to reflect the product line
2. Search results must generate correct prefixed URLs for each product
3. Product page lookups must work regardless of the prefix (the slug alone identifies the product)
4. The solution should be **generic** — not hardcoded to polgat/kitan
5. Need to determine: same package? same components? configuration mechanism?
6. The `category-page` and `product-search` components overlap significantly — a search page with an optional pre-selected category can replace both
7. Different top-level categories need different visual designs (different templates)

## Questions and Answers

### Q1: Should this be in the same `wix-stores` package or a new one?

**Answer: Same package.** The changes are surgical — they affect URL generation in the mapper, param loading, and require `ALL_CATEGORIES_INFO` in product fetches. Creating a separate package would duplicate most of the stores logic. The feature is opt-in via configuration.

### Q2: Do we need separate `category-page` and `product-search` components?

**Answer: No.** The `category-page` component is essentially a search page with a pre-selected category filter. The `product-search` component can absorb this role by accepting an optional category parameter. When a category is provided:
- The category filter is pre-selected
- The template can have a different design per category (since each category prefix gets its own static route with its own jay-html template)

This eliminates `category-page` as a separate component. The `product-search` component becomes the unified listing/search component.

### Q3: How should category-to-prefix mapping be configured?

**Answer: Plugin configuration.** The mapping is provided during plugin initialization. The store site owner defines which root categories map to which URL prefixes. This is the simplest approach — the config is available to all components and actions via the service layer.

### Q4: How does this interact with Jay routing?

**Answer: Static prefix routes with per-category templates.** Each category prefix gets its own directory with its own page templates. This enables different designs per category, which is a key requirement.

```
src/pages/products/
├── page.jay-html                         → /products (default search, optional)
├── [slug]/page.jay-html                  → /products/:slug (default product page, optional)
├── polgat/
│   ├── page.jay-html                     → /products/polgat (polgat search/listing, custom design)
│   └── [slug]/page.jay-html              → /products/polgat/:slug (polgat product page)
└── kitan/
    ├── page.jay-html                     → /products/kitan (kitan search/listing, custom design)
    └── [slug]/page.jay-html              → /products/kitan/:slug (kitan product page)
```

Jay's routing precedence ensures static segments (`polgat`, `kitan`) take priority over the dynamic `[slug]` parameter. Each template binds the same `product-search` or `product-page` headless component but with a completely different visual design.

The search page templates pass the category prefix as a prop/param to the component, which pre-selects the category filter. The product page templates work the same way — the slug identifies the product, the prefix is for routing and design selection.

### Q5: How to handle products that don't belong to any configured root category?

**Answer: Depends on whether the default route exists.**

1. If `/products/[slug]/page.jay-html` exists → uncategorized products are served there
2. If it does **not** exist → uncategorized products return 404

This is naturally handled by Jay's fs-route system — no special logic needed in the component. The `loadProductParams` function yields params for all routes: `{ slug }` for the default route (if it exists), and `{ slug }` under each prefix route for categorized products. The site author decides whether to include a default route by simply creating or omitting the directory.

### Q6: How does `allCategoriesInfo` affect data fetching?

`allCategoriesInfo` is **only** available via the `ALL_CATEGORIES_INFO` field flag. Currently:
- `queryProducts()` does NOT request this field (used in `loadProductParams`)
- `searchProducts()` does NOT request this field (used in search results)
- `getProductBySlug()` does NOT request this field

When category prefixes are configured, we need `ALL_CATEGORIES_INFO` in:
- `loadProductParams` — to determine each product's prefix
- `searchProducts` — to determine the prefix for each result's URL
- `getProductBySlug` — potentially, for validation

**Important**: `queryProducts()` (used in `loadProductParams`) supports a `fields` parameter. We need to check if `ALL_CATEGORIES_INFO` is available there or only via `getProduct()`.

### Q7: What if a product belongs to multiple configured root categories?

Take the **first matching** root category in the configuration order. The configuration is an ordered array, so the first match wins.

### Q8: How does the search page generate correct URLs?

The search page calls `searchProducts()` which calls `mapProductToCard()`. Currently, `mapProductToCard` takes a `productPagePath` string. With category prefixes:
- `mapProductToCard` needs to know the product's category info
- It needs access to the prefix configuration
- It generates `/products/polgat/[slug]` or `/products/kitan/[slug]` based on the product's categories

Two approaches:
- **A**: Pass category info + config to `mapProductToCard` → it resolves the prefix
- **B**: `searchProducts` action resolves the prefix and passes a per-product `productPagePath` to the mapper

**Recommended: A.** The mapper already receives the full product object. If we add `allCategoriesInfo` to the fetched fields, the mapper can resolve the prefix using the configuration.

## Design

### Configuration

```typescript
interface CategoryPrefixConfig {
    /** Root category ID in Wix */
    categoryId: string;
    /** URL prefix slug (e.g., 'polgat', 'kitan') */
    prefix: string;
}

// In plugin initialization:
initWixStores({
    categoryPrefixes: [
        { categoryId: '024a9fff-77de-4508-b82c-5fce24f74757', prefix: 'polgat' },
        { categoryId: 'eac4db24-04cc-4f36-86cf-c9da6e873421', prefix: 'kitan' }
    ]
})
```

The configuration is stored in `WixStoresService` and accessible to all components and actions.

### Unified Search + Category Component

The `product-search` component gains an optional `category` parameter (the prefix slug). When present:
- The root category ID is resolved from the prefix config
- All child categories under that root are pre-selected as the default filter
- The search is scoped to products within that category hierarchy
- The template controls the visual design (each prefix has its own jay-html file)

The `category-page` component is **removed** — its functionality is absorbed into `product-search`.

```typescript
// product-search component accepts optional category prefix
interface ProductSearchParams extends UrlParams {
    category?: string;  // e.g., 'polgat' — resolved from prefix config
}
```

When `category` is provided:
1. Resolve `categoryId` from `categoryPrefixes` config using the prefix
2. Use it as a default filter in `searchProducts` calls
3. Search results only show products from that category hierarchy
4. Product URLs in results use the category prefix

When `category` is absent:
- Behaves exactly like today's search page (all products, no pre-filter)

### URL Resolution

New utility function in `product-mapper.ts`:

```typescript
function resolveProductPrefix(
    product: { allCategoriesInfo?: { categories?: { _id: string }[] } },
    prefixConfig: CategoryPrefixConfig[]
): string | null {
    if (!prefixConfig?.length || !product.allCategoriesInfo?.categories) {
        return null;
    }
    const productCategoryIds = new Set(
        product.allCategoriesInfo.categories.map(c => c._id)
    );
    // First matching prefix wins (config order matters)
    for (const { categoryId, prefix } of prefixConfig) {
        if (productCategoryIds.has(categoryId)) {
            return prefix;
        }
    }
    return null;
}
```

### Modified `mapProductToCard`

```typescript
export function mapProductToCard(
    product: any,
    productPagePath: string = DEFAULT_PRODUCT_PAGE_PATH,
    prefixConfig?: CategoryPrefixConfig[]
): ProductCardViewState {
    const slug = product.slug || '';
    const prefix = resolveProductPrefix(product, prefixConfig);
    const fullPath = prefix
        ? `${productPagePath}/${prefix}/${slug}`
        : `${productPagePath}/${slug}`;

    return {
        ...
        productUrl: slug ? fullPath : '',
    };
}
```

### Route Structure

```
src/pages/products/
├── page.jay-html                         → /products (default search, optional)
├── [slug]/page.jay-html                  → /products/:slug (default product page, optional)
├── polgat/
│   ├── page.jay-html                     → /products/polgat (polgat-design search)
│   └── [slug]/page.jay-html              → /products/polgat/:slug (polgat product page)
└── kitan/
    ├── page.jay-html                     → /products/kitan (kitan-design search)
    └── [slug]/page.jay-html              → /products/kitan/:slug (kitan product page)
```

Each `page.jay-html` binds the same `product-search` or `product-page` headless component, but with different visual designs. The headless component provides the data; the template controls the presentation.

**Search pages**: `polgat/page.jay-html` and `kitan/page.jay-html` each bind `product-search` with different HTML/CSS. The component receives `category: 'polgat'` or `category: 'kitan'` and pre-filters accordingly.

**Product pages**: `polgat/[slug]/page.jay-html` and `kitan/[slug]/page.jay-html` bind `product-page`. The component receives `slug` for data lookup. The `category` param is used only for route validation.

**Default routes** (optional): `page.jay-html` and `[slug]/page.jay-html` serve as fallbacks for uncategorized products. If omitted, uncategorized products return 404.

### Modified `loadProductParams`

The product page component's `loadProductParams` yields params for **each route** that uses it. Since each prefix route is a separate page file binding the same component:

- `polgat/[slug]/page.jay-html` calls `loadProductParams` → yields only products belonging to polgat
- `kitan/[slug]/page.jay-html` calls `loadProductParams` → yields only products belonging to kitan
- `[slug]/page.jay-html` (if exists) calls `loadProductParams` → yields uncategorized products

The component knows which prefix it's serving via its route params or props. The `loadProductParams` function filters products accordingly using `allCategoriesInfo`.

```typescript
async function* loadProductParams(
    [wixStores]: [WixStoresService]
): AsyncIterable<ProductPageParams[]> {
    const prefixConfig = wixStores.categoryPrefixes;
    // ... fetch products with ALL_CATEGORIES_INFO when prefixConfig exists
    // ... yield { slug } for each product matching the current route's category
}
```

**Open question**: How does `loadProductParams` know which prefix route is calling it? Options:
- It receives the route's static params (e.g., knows it's being called from `polgat/[slug]`)
- It yields params for ALL products with their prefixes, and the framework routes them

This needs investigation into how Jay handles `loadParams` with static prefix routes.

### Modified `searchProducts` Action

When category prefixes are configured, request `ALL_CATEGORIES_INFO` in the search:

```typescript
const fields = prefixConfig?.length
    ? ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES', 'ALL_CATEGORIES_INFO']
    : ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'];
```

Then pass `prefixConfig` to `mapProductToCard` so each product card URL includes the correct prefix.

### Search Component: Category Pre-Selection

When the search component receives a `category` param:

```typescript
async function renderFastChanging(
    props: PageProps & ProductSearchParams,
    slowCarryForward: SearchSlowCarryForward,
    wixStores: WixStoresService
) {
    // Resolve category ID from prefix config
    const categoryPrefix = props.category;
    const categoryConfig = categoryPrefix
        ? wixStores.categoryPrefixes?.find(c => c.prefix === categoryPrefix)
        : null;

    // Default search filter: scope to this category
    const defaultCategoryIds = categoryConfig ? [categoryConfig.categoryId] : [];

    const result = await searchProducts({
        query: '',
        filters: {
            categoryIds: defaultCategoryIds
        },
        pageSize: PAGE_SIZE
    });
    // ...
}
```

### Product Page Component Changes

The `renderSlowlyChanging` function receives `props.slug` and looks up the product. The `props.category` param (if present from the static route) is used only for validation:

```typescript
async function renderSlowlyChanging(
    props: PageProps & ProductPageParams,
    wixStores: WixStoresService
) {
    // Lookup is always by slug (category prefix is routing-only)
    const result = await wixStores.products.getProductBySlug(props.slug, { fields });

    // Optional: validate that product actually belongs to the claimed category
    if (props.category) {
        const expectedPrefix = resolveProductPrefix(result.product, prefixConfig);
        if (expectedPrefix !== props.category) {
            return Pipeline.clientError(404, 'not found');
        }
    }
}
```

## Implementation Plan

### Phase 1: Configuration Infrastructure
1. Add `CategoryPrefixConfig` type definition
2. Add `categoryPrefixes` to the init options / service
3. Store config in `WixStoresService` for access by components and actions

### Phase 2: URL Resolution
1. Add `resolveProductPrefix()` utility to `product-mapper.ts`
2. Modify `mapProductToCard()` to accept and use `prefixConfig`
3. Update all callers of `mapProductToCard()` to pass the config

### Phase 3: Unified Search + Category Component
1. Add optional `category` param to `product-search` component
2. Resolve category ID from prefix config when param is present
3. Pre-filter search results to the category hierarchy
4. Remove `category-page` component (or deprecate)
5. Update `category-list` component to link to `/products/{prefix}` instead of `/categories/{slug}`

### Phase 4: SSG Param Loading
1. Modify `loadProductParams` to request `ALL_CATEGORIES_INFO` when config exists
2. Investigate how `loadParams` interacts with static prefix routes in Jay
3. Yield `{ slug }` for products matching the current route's prefix

### Phase 5: Search Action Integration
1. Modify `searchProducts` action to request `ALL_CATEGORIES_INFO` when configured
2. Pass `prefixConfig` through to `mapProductToCard`
3. Search results now generate prefixed URLs

### Phase 6: Product Page Validation
1. Accept `category` param in product page component (from static route)
2. Validate prefix matches product's actual category ancestry
3. Return 404 for mismatched category prefixes

## Trade-offs

### Pros
- **Simpler component model**: One search/listing component instead of separate search + category-page
- **Generic**: Configuration-driven, works for any number of root categories
- **Same package**: No new package, minimal surface area
- **Backward compatible**: Without config, behavior is identical
- **SEO-friendly**: Clean, meaningful URLs with category context
- **Per-category design**: Static prefix routes allow completely different templates per category
- **Graceful fallback**: Default route handles uncategorized products; omit it for strict 404

### Cons
- **Extra API field**: `ALL_CATEGORIES_INFO` adds data to every product fetch when configured — potential performance impact
- **Complexity in mapper**: `mapProductToCard` gains category awareness
- **Multiple template files**: Each category prefix needs its own directory with jay-html files (but this is intentional — enables different designs)
- **Config ordering matters**: First-match semantics may be non-obvious
- **Breaking change**: Removing `category-page` component affects existing sites using it

### Open Questions
1. Does `queryProducts()` support the `ALL_CATEGORIES_INFO` field flag? If not, `loadProductParams` needs to use `getProduct()` per product or `searchProducts()` instead
2. Should the category prefix be exposed in the `ProductCardViewState` contract (e.g., as a `categoryPrefix` field)? This would let templates show the category context
3. How does Jay's `loadParams` work with static prefix routes? Does the component know which static prefix it's being called from?
4. Performance: How much overhead does `ALL_CATEGORIES_INFO` add to search queries with 1000+ products?
5. Migration path: Should `category-page` be deprecated gradually or removed immediately?