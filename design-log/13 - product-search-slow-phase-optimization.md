# 13 - Product Search Slow Phase Optimization

## Status: Draft

## Background

The product search component (`product-search.ts` in wix-stores) renders in three phases:

- **Slow** (build-time/SSG): categories, category header, search config
- **Fast** (request-time/SSR): products, price aggregation, filters
- **Interactive** (client): search, filter, sort, load more

Currently, the `searchProducts` call always runs in the **fast phase**, even when the page has no query params (no filters, no search term, no sort). This means every request to a category page or the base products page makes a fresh server-side API call for the default product listing.

## Problem

For category pages and the base product listing without filters, the initial product set is deterministic — it depends only on the category (from the URL path), not on any user-specific query params. This data could be pre-rendered at build time (slow phase), saving an API call per request.

The fast phase should only be needed when the URL contains query params that change the result set: `?q=`, `?cat=`, `?min=`, `?max=`, `?inStock=`, `?sort=`.

## Design

### Decision Logic

```
URL has query params (q, cat, min, max, inStock, sort)?
  ├── YES → fetch products in FAST phase (current behavior)
  └── NO  → fetch products in SLOW phase (new behavior)
```

### What Moves to Slow Phase (when no query params)

- `searchProducts` call with base category only (no filters, default sort)
- Product list, price aggregation, pagination state

### What Stays in Fast Phase

- When query params are present: full `searchProducts` with filters/sort/search
- When no query params: fast phase becomes a pass-through (products already loaded in slow)

### Carry-Forward Changes

The slow carry-forward needs to pass products to the fast phase when they were loaded in slow:

```typescript
interface SearchSlowCarryForward {
  searchFields: string;
  fuzzySearch: boolean;
  categories: CategoryInfos;
  baseCategoryId: string | null;
  // New: pre-loaded products (null when fast phase should fetch)
  preloadedResult: SearchProductsOutput | null;
}
```

### Fast Phase Behavior

```typescript
async function renderFastChanging(props, slowCarryForward, wixStores) {
    const urlFilters = parseUrlFilters(props.url);
    const hasActiveFilters = urlFilters.searchTerm
        || urlFilters.selectedCategorySlugs.length > 0
        || urlFilters.minPrice !== null
        || urlFilters.maxPrice !== null
        || urlFilters.inStockOnly
        || urlFilters.sort !== 'relevance';

    if (!hasActiveFilters && slowCarryForward.preloadedResult) {
        // Use pre-loaded products from slow phase
        return buildPhaseOutput(slowCarryForward.preloadedResult, ...);
    }

    // Fetch with filters (current behavior)
    const result = await searchProducts({ ... });
    return buildPhaseOutput(result, ...);
}
```

### Slow Phase Changes

```typescript
async function renderSlowlyChanging(props, wixStores) {
  // ... existing category resolution ...

  // Pre-load products (no filters, default sort)
  const baseCategoryIds = baseCategoryId ? [baseCategoryId] : [];
  const preloadedResult = await searchProducts({
    query: '',
    filters: {
      categoryIds: baseCategoryIds.length > 0 ? baseCategoryIds : undefined,
    },
    pageSize: PAGE_SIZE,
  });

  return {
    viewState: {
      // ... existing slow view state ...
      // Also include product data so it renders at build time:
      searchResults: preloadedResult.products,
      resultCount: preloadedResult.products.length,
      // ...
    },
    carryForward: {
      // ... existing ...
      preloadedResult,
    },
  };
}
```

### Question: Slow View State for Products?

Products include `price` and `strikethroughPrice` which are `fast+interactive` phase fields in the contract. These cannot be rendered in the slow phase by design (they may change between builds).

**Decision**: Keep products in fast phase view state, but skip the API call when data is pre-loaded via carry-forward. Products still render in the fast phase — the optimization is avoiding a redundant API call, not changing rendering phases.

## Implementation Plan

### Phase 1: Detect Query Params

1. Add `hasActiveFilters` check based on parsed URL params
2. Determine at fast phase entry whether to use pre-loaded or fresh data

### Phase 2: Slow Phase Product Loading

1. Call `searchProducts` in slow phase with base category, no filters
2. Pass result in carry-forward as `preloadedResult`

### Phase 3: Fast Phase Pass-Through

1. When `preloadedResult` exists and no active filters, use it directly
2. When filters are active, fetch fresh (current behavior)

### Phase 4: Shared Output Builder

1. Extract the `toPhaseOutput` logic into a shared function
2. Used by both slow-preloaded and fast-fetched paths

## Trade-offs

### Pros

- Category pages and base listing render faster (no API call in fast phase)
- Pre-rendered product HTML available at build time (better TTFB)
- No behavior change for filtered/searched pages

### Cons

- Products in slow phase may be slightly stale (updated on next build)
- More data in slow carry-forward
- Slightly more complex rendering logic (two paths)

## Scope

- Applies to `wix-stores` product search component
- Only affects the initial page load — interactive search/filter always calls fresh
- Price aggregation (ranges, bounds) also pre-loaded in slow phase
