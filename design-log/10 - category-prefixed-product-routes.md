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

`queryProducts()` supports the `ALL_CATEGORIES_INFO` field flag, so `loadProductParams` can use it directly.

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
- Search is scoped to products within that category hierarchy (using the root category ID as filter)
- The **category filter UI** shows the **child categories** of the root — the root category itself is hidden (it's implicit from the route)
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
2. Use the root `categoryId` as a **base filter** in all `searchProducts` calls (always applied, not visible to user)
3. Query child categories of the root via `queryCategories().eq('parentCategory._id', rootCategoryId)`
4. Expose only child categories as filter options in the UI
5. Product URLs in results use the category prefix

When `category` is absent:
- Behaves exactly like today's search page (all products, all categories as filters)

### Category Filter: Child Categories

The slow render phase loads the filter categories:

```typescript
async function renderSlowlyChanging(
    props: PageProps & ProductSearchParams,
    wixStores: WixStoresService
) {
    const categoryPrefix = props.category;
    const categoryConfig = categoryPrefix
        ? wixStores.categoryPrefixes?.find(c => c.prefix === categoryPrefix)
        : null;

    let filterCategories;
    if (categoryConfig) {
        // Scoped: load only child categories of the root (root itself is hidden)
        const result = await wixStores.categories.queryCategories({
            treeReference: { appNamespace: "@wix/stores" }
        })
            .eq('visible', true)
            .eq('parentCategory._id', categoryConfig.categoryId)
            .find();
        filterCategories = result.items || [];
    } else {
        // Unscoped: load all visible categories (current behavior)
        const result = await wixStores.categories.queryCategories({
            treeReference: { appNamespace: "@wix/stores" }
        })
            .eq('visible', true)
            .find();
        filterCategories = result.items || [];
    }
    // ... map to CategoryInfos for the contract
}
```

This means:
- `/products/polgat` shows filters like: חולצות, מכנסיים, מעילים... (children of פולגת)
- `/products/kitan` shows filters like: חדר שינה, חדר רחצה, חדר ילדים... (children of כיתן)
- `/products` (default) shows all categories

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

`loadProductParams` is called **once** and yields params for **all routes**. It maps each product to its correct route based on category membership. The framework then distributes params to the matching routes.

When category prefixes are configured:
1. Fetch all products with `ALL_CATEGORIES_INFO`
2. For each product, resolve its prefix via `resolveProductPrefix()`
3. Yield `{ slug }` routed to the correct prefix path (e.g., `polgat/[slug]` or `kitan/[slug]`)
4. Products without a matching prefix yield `{ slug }` for the default `[slug]` route (if it exists)

```typescript
async function* loadProductParams(
    [wixStores]: [WixStoresService]
): AsyncIterable<ProductPageParams[]> {
    const prefixConfig = wixStores.categoryPrefixes;
    const fields = prefixConfig?.length ? ['ALL_CATEGORIES_INFO'] : [];

    let result = await wixStores.products.queryProducts({ fields }).find();

    yield result.items.map(product => {
        const prefix = resolveProductPrefix(product, prefixConfig);
        // The framework routes each param set to the matching route:
        // - { slug: 'x' } with prefix 'polgat' → polgat/[slug]
        // - { slug: 'x' } without prefix → [slug]
        return { slug: product.slug, ...(prefix ? { category: prefix } : {}) };
    });

    while (result.hasNext()) {
        result = await result.next();
        yield result.items.map(product => {
            const prefix = resolveProductPrefix(product, prefixConfig);
            return { slug: product.slug, ...(prefix ? { category: prefix } : {}) };
        });
    }
}
```

Jay's `loadParams` loads all yielded params from a single call, then matches them to routes based on fs routing. The framework handles distribution to the correct static prefix routes and dynamic fallback.

### Modified `searchProducts` Action

When category prefixes are configured, request `ALL_CATEGORIES_INFO` in the search:

```typescript
const fields = prefixConfig?.length
    ? ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES', 'ALL_CATEGORIES_INFO']
    : ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'];
```

Then pass `prefixConfig` to `mapProductToCard` so each product card URL includes the correct prefix.

### Search Component: Base Category Filter

The fast render phase applies the root category as a **base filter** — always active, not user-toggleable:

```typescript
async function renderFastChanging(
    props: PageProps & ProductSearchParams,
    slowCarryForward: SearchSlowCarryForward,
    wixStores: WixStoresService
) {
    // Resolve root category from prefix config
    const categoryConfig = props.category
        ? wixStores.categoryPrefixes?.find(c => c.prefix === props.category)
        : null;

    // Base filter: root category scopes all searches (always applied)
    const baseCategoryId = categoryConfig?.categoryId;

    const result = await searchProducts({
        query: '',
        filters: {
            // Root category is the base — user-selected child categories are added on top
            categoryIds: baseCategoryId ? [baseCategoryId] : []
        },
        pageSize: PAGE_SIZE
    });
    // ...
}
```

In the interactive phase, user-selected child category filters are **combined** with the base category filter. The base category is always in the filter — user selections narrow further within it.

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
3. Apply root category as base filter in all searches (always active, hidden from UI)
4. Load child categories of root as filter options (root itself hidden)
5. Remove `category-page` component and update examples that use it
6. Update `category-list` component to link to `/products/{prefix}` instead of `/categories/{slug}`

### Phase 4: SSG Param Loading
1. Modify `loadProductParams` to request `ALL_CATEGORIES_INFO` when config exists
2. Call once — yield all products with resolved prefixes for all routes
3. Framework distributes params to matching routes (static prefix routes + default fallback)

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
- **Extra API field**: `ALL_CATEGORIES_INFO` adds data to product fetches — acceptable since slow phase is cached and near build-time
- **Complexity in mapper**: `mapProductToCard` gains category awareness
- **Multiple template files**: Each category prefix needs its own directory with jay-html files (but this is intentional — enables different designs)
- **Config ordering matters**: First-match semantics may be non-obvious
- **Breaking change**: Removing `category-page` component — only affects examples in this repo, updated as part of implementation

### Resolved Questions
1. **`queryProducts()` + `ALL_CATEGORIES_INFO`**: Yes, it supports the field flag. `loadProductParams` can use `queryProducts({ fields: ['ALL_CATEGORIES_INFO'] })` directly.
2. **Expose prefix in contract**: Yes — add `categoryPrefix` (the category name, not the slug) to `ProductCardViewState` so templates can display the category context.
3. **`loadParams` distribution**: Jay loads all params from a single call, then matches them to routes based on fs routing. No special handling needed — yield all products with their prefixes, the framework routes them.
4. **`ALL_CATEGORIES_INFO` performance**: Minimal concern. `loadParams` runs in the slow phase (near build time) and results are cached in the dev server. For `searchProducts` at runtime, the overhead is acceptable.
5. **`category-page` removal**: Remove immediately. Only used in a few examples in this repo — update those examples as part of implementation.
6. **Child category filter depth**: Flat list of direct children only. Can be extended later if needed.