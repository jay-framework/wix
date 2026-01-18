# Design Log 03: Category Pages

## Background

The Wix Stores integration needs category pages that display products organized by collection/category. Each category should have its own URL (e.g., `/categories/[slug]`) and load products using slow rendering for optimal performance.

The Wix Catalog V3 API provides:
- **Query Categories** - List categories with filtering
- **List Items In Category** - Get product IDs in a category
- **Get Product** - Fetch individual product details

Reference: https://dev.wix.com/docs/api-reference/business-solutions/stores/catalog-v3/categories

## Problem

1. **Missing component**: No `categoryPage` component exported from wix-stores
2. **Existing contract**: `category-page.jay-contract` exists but the component (`category-page.ts.back`) is outdated
3. **API mapping**: Need to map Wix Categories API (V3) to the contract structure
4. **Async products**: Products should load via slow rendering with `async: true` on the products tag
5. **URL routing**: Need `loadParams` to generate URLs for each category

## Questions and Answers

**Q1: Should we use the existing `category-page.jay-contract` or modify it?**
A: Use and update it. The existing contract is comprehensive but needs minor adjustments for async products.

**Q2: How should products be loaded - via `listItemsInCategory` or `queryProducts` with category filter?**
A: Use `listItemsInCategory` API as it provides proper arrangement and is category-specific. Then fetch full product details.

**Q3: Should pagination be server-side or client-side?**
A: Server-side pagination in slow/fast render. Client triggers page changes which reload via interactive phase.

**Q4: Should we support subcategories/nested categories?**
A: Yes, via breadcrumbs. The category tree structure from Wix supports parent-child relationships.

**Q5: How to handle sorting and filtering?**
A: Sort via `sortBy` dropdown triggers re-fetch. Filters (price, stock) applied client-side to loaded products initially, with option for server-side filtering later.

## Proposed Design

### 1. Category Page URL Structure

```
/categories/[slug]       → Category page with product grid
/categories/[slug]?page=2&sort=priceAsc  → With pagination/sorting
```

### 2. Wix API Flow

```mermaid
sequenceDiagram
    participant Page
    participant Categories as categories API
    participant Products as productsV3 API
    
    Page->>Categories: queryCategories() (loadParams)
    Categories-->>Page: [all category slugs]
    
    Page->>Categories: getCategory(slug) (slow render)
    Categories-->>Page: Category info
    
    Page->>Categories: listItemsInCategory(categoryId, treeRef, {limit: 20})
    Categories-->>Page: Product IDs
    
    loop For each product ID
        Page->>Products: getProduct(productId, fields)
        Products-->>Page: Product data
    end
    
    Page->>Page: Map to ProductCardViewState
```

### 3. Component Structure

```typescript
// category-page.ts

interface CategoryPageParams extends UrlParams {
  slug: string;
}

interface CategorySlowCarryForward {
  categoryId: string;
  categorySlug: string;
  parentCategories: Array<{id: string, name: string, slug: string}>;
}

interface CategoryFastCarryForward {
  categoryId: string;
  totalProducts: number;
  pageSize: number;
}

// loadParams - Generate URLs for all categories
async function* loadCategoryParams(
  [wixStores]: [WixStoresService]
): AsyncIterable<CategoryPageParams[]> {
  const { items } = await wixStores.categories.queryCategories({
    treeReference: { appNamespace: "@wix/stores" }
  }).find();
  
  yield items
    .filter(cat => cat.visible !== false)
    .map(cat => ({ slug: cat.slug }));
}

// slowlyRender - Load category metadata + products
async function renderSlowlyChanging(
  props: PageProps & CategoryPageParams,
  wixStores: WixStoresService
) {
  // 1. Find category by slug
  const { items } = await wixStores.categories.queryCategories({
    treeReference: { appNamespace: "@wix/stores" }
  }).eq('slug', props.slug).find();
  
  if (!items?.length) return notFound();
  const category = items[0];
  
  // 2. Load products in category
  const productsResponse = await wixStores.categories.listItemsInCategory(
    category._id,
    { appNamespace: "@wix/stores" },
    { useCategoryArrangement: true, cursorPaging: { limit: 20 } }
  );
  
  // 3. Fetch full product details
  const productCards = await Promise.all(
    productsResponse.items.map(async (item) => {
      const { product } = await wixStores.products.getProduct(
        item.itemId, 
        { fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'] }
      );
      return mapProductToCard(product, '/products');
    })
  );
  
  // 4. Build breadcrumbs from parent chain
  const breadcrumbs = await buildBreadcrumbs(category, wixStores);
  
  return RenderPipeline.ok({
    _id: category._id,
    name: category.name,
    description: category.description || '',
    slug: category.slug,
    visible: category.visible !== false,
    numberOfProducts: productsResponse.metadata?.totalCount || productCards.length,
    media: mapCategoryMedia(category),
    breadcrumbs,
    products: productCards,
  }).toPhaseOutput(viewState => ({
    viewState,
    carryForward: {
      categoryId: category._id,
      categorySlug: category.slug,
      parentCategories: breadcrumbs.map(b => ({
        id: b.categoryId, name: b.categoryName, slug: b.categorySlug
      }))
    }
  }));
}
```

### 4. Contract Updates

The existing `category-page.jay-contract` is mostly correct. Minor updates:

```yaml
# Ensure products link to product-card contract
- tag: products
  type: sub-contract
  repeated: true
  trackBy: _id
  description: Products in this category
  link: ./product-card
```

Remove `async: true` from products since we're loading them synchronously in slow render (they're part of the slow viewstate, not a separate async load).

### 5. Interactive Phase

```typescript
function CategoryPageInteractive(
  props: Props<PageProps & CategoryPageParams>,
  refs: CategoryPageRefs,
  viewStateSignals: Signals<CategoryPageFastViewState>,
  fastCarryForward: CategoryFastCarryForward,
  storesContext: WixStoresContext
) {
  const {
    pagination: [pagination, setPagination],
    sortBy: [sortBy, setSortBy],
    filters: [filters, setFilters],
    isLoading: [isLoading, setIsLoading],
    products: [products, setProducts],
  } = viewStateSignals;

  // Sort change triggers reload
  refs.sortBy.sortDropdown.oninput(async ({ event }) => {
    const value = (event.target as HTMLSelectElement).value;
    setSortBy({ currentSort: value });
    await reloadProducts();
  });

  // Pagination
  refs.pagination.nextButton.onclick(async () => {
    const current = pagination().currentPage;
    setPagination(patch(pagination(), [
      { op: REPLACE, path: ['currentPage'], value: current + 1 }
    ]));
    await reloadProducts();
  });

  // Add to cart on product cards
  refs.products.addToCartButton.onclick(async ({ coordinate }) => {
    const [productId] = coordinate;
    await storesContext.addToCart(productId, 1);
  });
  
  return {
    render: () => ({
      isLoading: isLoading(),
      products: products(),
      pagination: pagination(),
      sortBy: sortBy(),
      filters: filters(),
      hasProducts: products().length > 0
    })
  };
}
```

### 6. Example HTML Template

```html
<html>
<head>
  <script type="application/jay-headless"
    plugin="@jay-framework/wix-stores"
    contract="category-page"
    key="categoryPage"
  ></script>
</head>
<body>
  <div class="category-page">
    <!-- Breadcrumbs -->
    <nav class="breadcrumbs">
      <a href="/categories">All Categories</a>
      <span forEach="categoryPage.breadcrumbs" trackBy="categoryId">
        <span class="separator">/</span>
        <a href="/categories/{categorySlug}" ref="categoryPage.breadcrumbs.categoryLink">
          {categoryName}
        </a>
      </span>
    </nav>

    <!-- Category Header -->
    <header class="category-header">
      <h1>{categoryPage.name}</h1>
      <p if="categoryPage.description">{categoryPage.description}</p>
      <span class="product-count">{categoryPage.numberOfProducts} products</span>
    </header>

    <!-- Toolbar -->
    <div class="category-toolbar">
      <select ref="categoryPage.sortBy.sortDropdown">
        <option value="newest">Newest</option>
        <option value="priceAsc">Price: Low to High</option>
        <option value="priceDesc">Price: High to Low</option>
        <option value="nameAsc">Name: A-Z</option>
      </select>
    </div>

    <!-- Loading State -->
    <div class="loading-overlay" if="categoryPage.isLoading">
      Loading...
    </div>

    <!-- Empty State -->
    <div class="empty-state" if="!categoryPage.hasProducts">
      No products in this category.
    </div>

    <!-- Product Grid -->
    <div class="product-grid" if="categoryPage.hasProducts">
      <article class="product-card" 
        forEach="categoryPage.products" 
        trackBy="_id">
        <a href="{productUrl}" class="product-card-image">
          <img src="{thumbnail.url}" alt="{name}" loading="lazy" />
        </a>
        <div class="product-card-content">
          <h3>{name}</h3>
          <span class="price">{actualPriceRange.minValue.formattedAmount}</span>
          <button ref="categoryPage.products.addToCartButton"
            if="quickAddType == SIMPLE">
            Add to Cart
          </button>
        </div>
      </article>
    </div>

    <!-- Pagination -->
    <nav class="pagination" if="categoryPage.pagination.totalPages > 1">
      <button ref="categoryPage.pagination.prevButton"
        disabled="{categoryPage.pagination.currentPage <= 1}">
        Previous
      </button>
      <span>{categoryPage.pagination.currentPage} / {categoryPage.pagination.totalPages}</span>
      <button ref="categoryPage.pagination.nextButton"
        disabled="{categoryPage.pagination.currentPage >= categoryPage.pagination.totalPages}">
        Next
      </button>
    </nav>
  </div>
</body>
</html>
```

## Implementation Plan

### Phase 1: Contract Updates
1. Review and update `category-page.jay-contract` (remove async from products)
2. Ensure proper `link: ./product-card` on products tag
3. Regenerate contract types

### Phase 2: Component Implementation
1. Implement `category-page.ts` component:
   - `loadCategoryParams` - yield category slugs
   - `renderSlowlyChanging` - load category + products
   - `renderFastChanging` - pagination metadata
   - `CategoryPageInteractive` - sort/filter/pagination handlers
2. Export from `index.ts`

### Phase 3: API Integration
1. Use `categories.queryCategories()` for category lookup
2. Use `categories.listItemsInCategory()` for product IDs
3. Use `products.getProduct()` for full product data
4. Map products with existing `mapProductToCard()`

### Phase 4: Example Implementation
1. Create `/categories/[slug]/page.jay-html` in example project
2. Add category listing page at `/categories/page.jay-html`
3. Add styles to `store-theme.css`

## Trade-offs

| Decision | Pros | Cons |
|----------|------|------|
| Sync products in slow render | Simple, SSG-friendly | Slower initial build for large categories |
| listItemsInCategory API | Respects category arrangement | Extra API call vs queryProducts filter |
| Server-side pagination | Fresh data per page | More API calls on page change |
| Reuse product-card contract | Consistency, DRY | Full product card data (maybe overkill) |

## Verification Criteria

1. **Category URLs**: `/categories/[slug]` resolves to correct category
2. **Product display**: Products show with correct data from category
3. **Pagination**: Page navigation loads correct products
4. **Sorting**: Sort changes reflect in product order
5. **Breadcrumbs**: Parent categories linked correctly
6. **Empty state**: Shows message when category has no products
7. **Loading state**: Shows indicator during product reload
8. **Add to cart**: Quick-add works on simple products
9. **404 handling**: Invalid category slugs return 404

---

## Revision 2: Simplified Category Pages

### Changes from Revision 1

1. **New `category-list` component**: Dedicated component for displaying category grid on home page
2. **Remove categories listing page**: Categories shown on home page instead of `/categories`
3. **Parallel product loading**: Products loaded in parallel during slow phase, rendered in fast phase (not async)
4. **Simplified category page**:
   - Remove filters (price range, in-stock only)
   - Remove sorting dropdown
   - Remove pagination (prev/next/page numbers)
   - Add "Load More" button only
5. **Product search load more**: Replace pagination with "Load More" button

### New Component: category-list

```yaml
name: category-list
tags:
  - tag: categories
    type: sub-contract
    repeated: true
    trackBy: _id
    description: List of visible categories
    tags:
      - tag: _id
        type: data
        dataType: string
      - tag: name
        type: data
        dataType: string
      - tag: slug
        type: data
        dataType: string
      - tag: description
        type: data
        dataType: string
      - tag: productCount
        type: data
        dataType: number
      - tag: imageUrl
        type: data
        dataType: string
      - tag: categoryLink
        type: interactive
        elementType: HTMLAnchorElement
        
  - tag: hasCategories
    type: variant
    dataType: boolean
```

### Simplified category-page Contract

```yaml
name: category-page
tags:
  # Category info (slow phase)
  - _id, name, description, slug, visible, numberOfProducts
  - media (mainMedia, items)
  - breadcrumbs
  
  # Initial products (SSR - slow phase)
  - tag: products
    type: sub-contract
    repeated: true
    trackBy: _id
    link: ./product-card
    # No phase = slow (default)
  
  # Additional products (loaded on client via "load more")
  - tag: loadedProducts
    type: sub-contract
    repeated: true
    trackBy: _id
    link: ./product-card
    phase: interactive
  
  # Load more state (fast+interactive)
  - tag: hasMore
    type: variant
    dataType: boolean
    phase: fast+interactive
    
  - tag: loadMoreButton
    type: interactive
    elementType: HTMLButtonElement
    
  - tag: isLoading
    type: variant
    dataType: boolean
    phase: fast+interactive
    
  - tag: hasProducts
    type: variant
    dataType: boolean
    phase: fast+interactive
```

**Key insight**: Two separate product lists:
1. `products` - SSR products rendered in slow phase (build time)
2. `loadedProducts` - Products loaded on client via "load more" button

The cursor from `pagingMetadata.cursors.next` is captured in carry forward. The interactive phase appends to `loadedProducts` (not `products`).

### Updated API Flow

```mermaid
sequenceDiagram
    participant Page
    participant Categories as categories API
    participant Products as productsV3 API
    
    Note over Page: Slow Rendering Phase
    Page->>Categories: queryCategories(slug)
    Categories-->>Page: Category info
    
    par Parallel Product Loading
        Page->>Categories: listItemsInCategory(limit: 20)
        Categories-->>Page: Product IDs + cursor
        loop For each product ID (parallel)
            Page->>Products: getProduct()
            Products-->>Page: Product data
        end
    end
    Page->>Page: products[] = loaded products
    Page->>Page: Store cursor in carryForward
    
    Note over Page: Fast Rendering Phase
    Page->>Page: loadedProducts[] = empty
    Page->>Page: hasMore = (cursor !== null)
    
    Note over Page: Interactive Phase (on Load More click)
    Page->>Categories: listItemsInCategory(cursor)
    Categories-->>Page: Next batch + new cursor
    loop For each product ID (parallel)
        Page->>Products: getProduct()
        Products-->>Page: Product data
    end
    Page->>Page: Append to loadedProducts[]
    Page->>Page: Update cursor
```

### Implementation Plan (Revision 2)

#### Phase 1: category-list Component
1. Create `category-list.jay-contract` with categories array
2. Create `category-list.ts` component (slow render only - categories are static)
3. Export from index.ts

#### Phase 2: Simplify category-page
1. Update `category-page.jay-contract`:
   - Remove `pagination`, `sortBy`, `filters` sub-contracts
   - Add `hasMore`, `loadMoreButton`
   - Change products phase to `slow+fast+interactive`
2. Update `category-page.ts`:
   - Move product loading to slow phase (parallel fetch)
   - Remove pagination/sort/filter interactive handlers
   - Add loadMore handler that appends products

#### Phase 3: Update product-search
1. Update `product-search.jay-contract`:
   - Remove `prevButton`, `nextButton`, `pageNumbers` from pagination
   - Keep only `loadMoreButton`, `hasNextPage`
2. Update `product-search.ts`:
   - Remove prev/next handlers
   - Update loadMore to append results

#### Phase 4: Update Examples
1. Add category-list to home page (`store/src/pages/page.jay-html` or similar)
2. Simplify `/categories/[slug]/page.jay-html` (remove filters/sort/pagination UI)
3. Update `/products/page.jay-html` for load more

---

## Implementation Results (Revision 2)

### Files Created

**New Contracts:**
- `wix/packages/wix-stores/lib/contracts/category-list.jay-contract` - Category grid component contract

**New Components:**
- `wix/packages/wix-stores/lib/components/category-list.ts` - Slow-render-only component that loads all visible categories

**New Example Pages:**
- `wix/examples/store/src/pages/page.jay-html` - Home page with hero section and category grid

### Files Modified

**Contracts:**
- `wix/packages/wix-stores/lib/contracts/category-page.jay-contract` - Simplified:
  - Removed `pagination`, `sortBy`, `filters` sub-contracts
  - Added `hasMore`, `loadMoreButton`, `loadedCount`
  - Changed products phase to `slow+fast+interactive`

- `wix/packages/wix-stores/lib/contracts/product-search.jay-contract` - Changed pagination to load more:
  - Removed `pagination.prevButton`, `nextButton`, `pageNumbers`
  - Added `hasMore`, `loadMoreButton`, `loadedCount`, `totalCount`

**Components:**
- `wix/packages/wix-stores/lib/components/category-page.ts` - Rewritten:
  - Products now loaded in parallel during slow phase
  - Fast phase just sets up load more metadata
  - Interactive phase handles only `loadMoreButton` and add-to-cart
  - Removed all filter/sort/pagination handlers

- `wix/packages/wix-stores/lib/components/product-search.ts` - Updated:
  - Removed pagination prev/next/page handlers
  - Added `performLoadMore()` that appends results
  - Changed reactive effect to reset page on parameter changes

**Exports:**
- `wix/packages/wix-stores/lib/index.ts` - Added export for `category-list` component

**Example Pages:**
- `wix/examples/store/src/pages/categories/[slug]/page.jay-html` - Simplified:
  - Removed filters sidebar, sorting dropdown, pagination controls
  - Added "Load More Products" button and loading indicator
  
- `wix/examples/store/src/pages/products/page.jay-html` - Updated:
  - Replaced pagination controls with "Load More Products" button
  - Shows "X of Y products" instead of "Page X of Y"
  - Added loading indicator for load more

### Files Deleted

- `wix/examples/store/src/pages/categories/page.jay-html` - Categories listing page (replaced by home page)
- `wix/examples/store/src/pages/categories/page.jay-html.d.ts` - Type definition for deleted page

### Key Changes Summary

| Feature | Before | After |
|---------|--------|-------|
| Category listing | Separate `/categories` page | Home page with category grid |
| Category component | Uses product-search | New `category-list` component |
| Product loading | Fast phase (request-time) | Slow phase (parallel, build-time) |
| Category page filters | Price range, in-stock | Removed |
| Category page sorting | Dropdown with 5 options | Removed |
| Category page pagination | Prev/Next/Page numbers | Load More button (cursor-based) |
| Product search pagination | Page-based (`page`, `pageSize`) | Cursor-based (`cursor`, `pageSize`) |
| Context method | `loadCategoryProducts(page, size, sort)` | `loadMoreCategoryProducts(cursor, size)` |
| Search action | `searchProducts({page, pageSize})` | `searchProducts({cursor, pageSize})` returns `{nextCursor, hasMore}` |

---

## Implementation Results (Revision 1)

### Files Modified

**Contract:**
- `wix/packages/wix-stores/lib/contracts/category-page.jay-contract` - Removed `async: true` from products, added `phase: fast+interactive` to products, pagination, sortBy, filters, isLoading, hasProducts
- `wix/packages/wix-stores/lib/contracts/product-search.jay-contract` - Added `categorySlug` to category filter for URL generation

**Component:**
- `wix/packages/wix-stores/lib/components/category-page.ts` - New full implementation with:
  - `loadCategoryParams` - yields all visible category slugs
  - `renderSlowlyChanging` - loads category metadata, media, breadcrumbs
  - `renderFastChanging` - loads products via listItemsInCategory + getProduct
  - `CategoryPageInteractive` - handles sort, filter, pagination, add-to-cart

**Context:**
- `wix/packages/wix-stores/lib/contexts/wix-stores-context.ts` - Added `loadCategoryProducts()` method for interactive phase reloading

**Exports:**
- `wix/packages/wix-stores/lib/index.ts` - Added export for category-page component

**Examples:**
- `wix/examples/store/src/pages/categories/[slug]/page.jay-html` - Category detail page with products grid
- `wix/examples/store/src/pages/categories/page.jay-html` - Category listing page using product-search categories

### Files Deleted
- `wix/packages/wix-stores/lib/components/category-page.ts.back` - Removed outdated backup

### Deviations from Design

1. **Products loaded in fast phase instead of slow**: Changed to `phase: fast+interactive` for products since they need client-side updates for pagination/sorting
2. **Category listing reuses product-search**: Instead of a separate category listing component, the `/categories` page reuses `product-search` which already loads categories for filtering
3. **Client-side sorting**: The `listItemsInCategory` API doesn't support server-side sorting, so sorting is done client-side in `loadCategoryProducts()`
4. **API signature fix**: `listItemsInCategory` requires `treeReference` as second argument: `listItemsInCategory(categoryId, { appNamespace: "@wix/stores" }, options)`
5. **Cursor-based pagination**: The API uses cursor paging, not offset paging. Initial implementation fetches first page only; cursor tracking for subsequent pages is a future enhancement

### Next Steps
1. Run contract type generation (`yarn build` in wix-stores package)
2. Test with real Wix Stores data
3. Add category images to listing page when available from API

---

## Revision 3: Switch to searchProducts API

### Background

The `queryProducts` API has limited filter and sort support:
- **Sorting**: Only `_createdDate` and `slug` supported
- **Filters**: Only basic fields (`visible`, `_id`, `slug`, etc.)
- **No price filtering/sorting**
- **No stock status filtering**
- **No text search**

The `searchProducts` API provides full search capabilities:
- **Sorting**: Price, date, name, weight
- **Filters**: Price range, stock status, categories
- **Text search**: On `name`, `description`, `sku` fields

Reference: https://dev.wix.com/docs/sdk/backend-modules/stores/catalog-v3/products-v3/search-products

### searchProducts API Capabilities

| Field | Search | Filter | Sort |
|-------|--------|--------|------|
| `name` | ✓ | ✓ ($eq, $begins, etc.) | ASC, DESC |
| `description` | ✓ | ✗ | ✗ |
| `actualPriceRange.minValue.amount` | ✗ | ✓ ($gt, $lt, $gte, $lte) | ASC, DESC |
| `inventory.availabilityStatus` | ✗ | ✓ ($eq, $in) | ✗ |
| `allCategoriesInfo.categories` | ✗ | ✓ ($matchItems) | ✗ |
| `_createdDate` | ✗ | ✓ | ASC, DESC |

### API Usage

```typescript
const filter = {
  // Price filter
  "actualPriceRange.minValue.amount": { "$gt": "50", "$lt": "200" },
  // Stock filter
  "inventory.availabilityStatus": { "$eq": "IN_STOCK" },
  // Category filter
  "allCategoriesInfo.categories": { 
    "$matchItems": [{ id: { $eq: "category-id" } }] 
  },
  // Visibility
  "visible": { "$eq": true }
};

const sort = [
  { fieldName: "actualPriceRange.minValue.amount", order: "ASC" }
];

const response = await productsClient.searchProducts(
  {
    filter,
    sort,
    cursorPaging: { limit: 12 },
    search: {
      expression: "search term",
      fields: ["name", "description"]
    }
  },
  { fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'] }
);
```

### Implementation Changes

1. **Replace `queryProducts` with `searchProducts`** in `stores-actions.ts`
2. **Build server-side filters**:
   - Price range → `actualPriceRange.minValue.amount` with `$gt`/`$lt`
   - Stock → `inventory.availabilityStatus` with `$eq: "IN_STOCK"`
   - Category → `allCategoriesInfo.categories` with `$matchItems`
3. **Build server-side sorting**:
   - `price_asc` → `{ fieldName: "actualPriceRange.minValue.amount", order: "ASC" }`
   - `price_desc` → `{ fieldName: "actualPriceRange.minValue.amount", order: "DESC" }`
   - `name_asc` → `{ fieldName: "name", order: "ASC" }`
   - `name_desc` → `{ fieldName: "name", order: "DESC" }`
   - `newest` → `{ fieldName: "_createdDate", order: "DESC" }`
4. **Use search expression** for text search:
   - `search: { expression: query, fields: ["name", "description"] }`
5. **Remove client-side filters** - all done server-side now
6. **Update `countProducts`** to use same filters for accurate count

### Implementation Results (Revision 3)

**Files Modified:**
- `wix/packages/wix-stores/lib/actions/stores-actions.ts` - Rewrote `searchProducts` action

**Key Changes:**

| Before (queryProducts) | After (searchProducts) |
|------------------------|------------------------|
| Client-side text search | Server-side: `search: { expression, fields: ["name", "description"] }` |
| Client-side price filter | Server-side: `actualPriceRange.minValue.amount` with `$gte`/`$lte` |
| Client-side stock filter | Server-side: `inventory.availabilityStatus: { $eq: "IN_STOCK" }` |
| Client-side price sorting | Server-side: `sort: [{ fieldName, order: "ASC"/"DESC" }]` |
| Only `_createdDate`/`slug` sorting | Full sorting on price, name, date |

**API Call Structure:**

```typescript
await wixStores.products.searchProducts(
  {
    filter: {
      "visible": { "$eq": true },
      "actualPriceRange.minValue.amount": { "$gte": "10", "$lte": "100" },
      "inventory.availabilityStatus": { "$eq": "IN_STOCK" },
      "allCategoriesInfo.categories": { 
        "$matchItems": [{ id: { "$eq": "category-id" } }] 
      }
    },
    sort: [{ fieldName: "actualPriceRange.minValue.amount", order: "ASC" }],
    cursorPaging: { limit: 12 },
    search: { expression: "search term", fields: ["name", "description"] }
  },
  { fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'] }
);
```

**Note on countProducts:**
The `countProducts` API uses a different filter syntax than `searchProducts`. Currently only applying `visible` and `categoryIds` filters for count accuracy. Full filter parity would require translating all searchProducts filters to countProducts format.
