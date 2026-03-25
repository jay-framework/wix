# Design Log 08: Wix Data List - Slow/Fast Rendering Pattern

## Background

The wix-data plugin provides dynamic contract generation for Wix Data collections. The list component (`collection-list.ts`) and generator (`list-contract-generator.ts`) handle index and category pages.

Currently, the list component loads all items in the slow phase but the contract and component need refinement to match the pattern established in wix-stores `category-page`:

- First page rendered as **slow** (build-time/SSG)
- Additional pages loaded interactively via "load more"

### Reference Implementations

- **wix-stores category-page**: Uses `products` (slow) + `loadedProducts` (fast+interactive) pattern
- **Jay Design Log #50**: Rendering phases in contracts
- **Jay Design Log #75**: Slow rendering jay-html to jay-html
- **Jay Design Log #79**: Linked contracts with mixed phase properties

## Problem

1. **Contract incomplete**: Current list contract doesn't distinguish between slow-rendered first page and interactively-loaded pages
2. **Missing loadedItems**: No separate array for dynamically loaded items (like `loadedProducts` in category-page)
3. **Component needs update**: Component should produce first page in slow phase, subsequent pages in interactive phase

### Current Contract Structure

```yaml
# Current list-contract-generator.ts output
name: BlogPostsList
tags:
  - tag: items            # No explicit phase (defaults to slow) ✓
    type: sub-contract
    repeated: true
    trackBy: _id
    ...
  - tag: totalCount       # No phase specified
    type: data
    dataType: number
  - tag: hasMore          # fast+interactive ✓
    type: variant
    dataType: boolean
    phase: fast+interactive
  - tag: isLoading        # fast+interactive ✓
    type: variant
    dataType: boolean
    phase: fast+interactive
  - tag: loadMoreButton   # interactive ✓
    type: interactive
    elementType: HTMLButtonElement
```

### Missing Elements

1. `loadedItems` - array for dynamically loaded items (`phase: fast+interactive`)
2. `loadedCount` - count of currently loaded items (`phase: fast+interactive`)

## Questions and Answers

**Q1: Should we follow the exact pattern from category-page?**  
A: Yes. The pattern is proven and provides:

- Fast initial render (slow-phase items baked into HTML)
- Efficient client-side loading (only new items sent over the wire)
- Clear separation of concerns

**Q2: Should items in `loadedItems` have the same structure as `items`?**  
A: Yes, both should use the same card structure. In the generator, we can inline the tags or reference a shared definition.

**Q3: What about the totalCount - should it be slow or fast phase?**  
A: Keep it as slow (default). The total count is determined at build time and doesn't change during client-side interactions (unless we support real-time updates, which we don't).

**Q4: Should we support sorting or filtering on the list?**  
A: No for now. Keep it simple - just pagination via "load more". Filtering/sorting can be added in a future iteration (like product-search has).

## Design

### Updated Contract Structure

```yaml
name: {CollectionName}List
tags:
  # Initial items (slow phase - build time)
  - tag: items
    type: sub-contract
    repeated: true
    trackBy: _id
    description: Initial items (rendered server-side)
    tags:
      - {tag: _id, type: data, dataType: string}
      - {tag: url, type: data, dataType: string, description: Full URL to item page}
      - {tag: itemLink, type: interactive, elementType: HTMLAnchorElement}
      # ... field-specific tags from schema

  # Additional items (loaded on client via "load more")
  - tag: loadedItems
    type: sub-contract
    repeated: true
    trackBy: _id
    phase: fast+interactive
    description: Additional items loaded on the client
    tags:
      # Same structure as items
      - {tag: _id, type: data, dataType: string}
      - {tag: url, type: data, dataType: string}
      - {tag: itemLink, type: interactive, elementType: HTMLAnchorElement}
      # ... field-specific tags

  # Metadata
  - {tag: totalCount, type: data, dataType: number, description: Total items}

  # Load more state
  - {tag: hasMore, type: variant, dataType: boolean, phase: fast+interactive, description: More items available}
  - {tag: isLoading, type: variant, dataType: boolean, phase: fast+interactive, description: Loading state}
  - {tag: loadedCount, type: data, dataType: number, phase: fast+interactive, description: Items currently loaded}
  - {tag: loadMoreButton, type: interactive, elementType: HTMLButtonElement, description: Load more trigger}

  # Category (if configured)
  # ... existing category sub-contract

  # Breadcrumbs
  # ... existing breadcrumbs sub-contract
```

### Component Changes

#### Slow Render Phase

```typescript
async function renderSlowlyChanging(
  props: PageProps & ListPageParams & DynamicContractProps<WixDataMetadata>,
  wixData: WixDataService,
) {
  // ... existing category logic ...

  // Query first page of items
  const result = await query.limit(PAGE_SIZE).find();

  // Map items to view state
  const items = result.items.map((item) => ({
    _id: item._id!,
    url: `${config.pathPrefix}/${item.data?.[config.slugField] || item._id}`,
    ...item.data,
  }));

  return Pipeline.ok({
    items, // Slow phase items
    totalCount: result.totalCount || items.length,
    category: categoryData,
    breadcrumbs,
  }).toPhaseOutput((data) => ({
    viewState: data,
    carryForward: {
      collectionId,
      categoryId: data.categoryId,
      nextCursor: result.cursors?.next || null,
      totalCount: data.totalCount,
    },
  }));
}
```

#### Fast Render Phase

```typescript
async function renderFastChanging(
  props: PageProps & ListPageParams & DynamicContractProps<WixDataMetadata>,
  slowCarryForward: ListSlowCarryForward,
  wixData: WixDataService,
) {
  return Pipeline.ok({
    loadedItems: [], // Empty initially
    hasMore: slowCarryForward.nextCursor !== null,
    isLoading: false,
    loadedCount: 0, // NEW: track loaded count
  }).toPhaseOutput((viewState) => ({
    viewState,
    carryForward: {
      collectionId: slowCarryForward.collectionId,
      categoryId: slowCarryForward.categoryId,
      nextCursor: slowCarryForward.nextCursor,
    },
  }));
}
```

#### Interactive Phase

```typescript
function ListInteractive(
  _props: Props<PageProps & ListPageParams>,
  refs: any,
  viewStateSignals: Signals<ListFastViewState>,
  fastCarryForward: ListFastCarryForward,
  wixDataContext: WixDataContext,
) {
  const {
    hasMore: [hasMore, setHasMore],
    isLoading: [isLoading, setIsLoading],
    loadedItems: [loadedItems, setLoadedItems], // NEW
    loadedCount: [loadedCount, setLoadedCount], // NEW
  } = viewStateSignals;

  let currentCursor = fastCarryForward.nextCursor;

  refs.loadMoreButton?.onclick(async () => {
    if (!currentCursor || isLoading()) return;

    setIsLoading(true);

    try {
      const result = await wixDataContext.items
        .queryDataItems({
          dataCollectionId: fastCarryForward.collectionId,
        })
        .limit(PAGE_SIZE)
        .skipTo(currentCursor)
        .find();

      // Map new items and append to loadedItems
      const newItems = result.items.map((item) => ({
        _id: item._id!,
        url: `${config.pathPrefix}/${item.data?.[config.slugField] || item._id}`,
        ...item.data,
      }));

      setLoadedItems([...loadedItems(), ...newItems]);
      setLoadedCount(loadedCount() + newItems.length);
      setHasMore(result.hasNext?.() ?? false);
      currentCursor = result.cursors?.next || null;
    } catch (error) {
      console.error('[wix-data] Failed to load more items:', error);
    } finally {
      setIsLoading(false);
    }
  });

  return {
    render: () => ({
      loadedItems: loadedItems(),
      hasMore: hasMore(),
      isLoading: isLoading(),
      loadedCount: loadedCount(),
    }),
  };
}
```

### Generator Changes

Update `list-contract-generator.ts`:

```typescript
function buildContract(schema: ProcessedSchema): string {
  const tags: string[] = [];

  // Initial items (slow phase - build time)
  tags.push(buildItemsSubContract(schema, 'items', undefined)); // no phase = slow

  // Additional items (fast+interactive - loaded on client)
  tags.push(buildItemsSubContract(schema, 'loadedItems', 'fast+interactive'));

  // Metadata (slow phase)
  tags.push(dataTag('totalCount', 'number', 'Total items'));

  // Load more state (fast+interactive)
  tags.push(variantTag('hasMore', 'boolean', 'fast+interactive', 'More items available'));
  tags.push(variantTag('isLoading', 'boolean', 'fast+interactive', 'Loading state'));
  tags.push(dataTag('loadedCount', 'number', 'fast+interactive', 'Items currently loaded'));
  tags.push(interactiveTag('loadMoreButton', 'HTMLButtonElement', 'Load more trigger'));

  // ... rest of existing logic (category, breadcrumbs)

  return `name: ${toPascalCase(schema.collectionId)}List
description: List page for ${schema.displayName || schema.collectionId}
tags:
${tags.join('\n')}`;
}

function buildItemsSubContract(schema: ProcessedSchema, tagName: string, phase?: string): string {
  const cardTags: string[] = [
    dataTag('_id', 'string', undefined, 6),
    dataTag('url', 'string', 'Full URL to item page', 6),
    interactiveTag('itemLink', 'HTMLAnchorElement', undefined, 6),
  ];

  schema.fields.filter(isCardField).forEach((f) => {
    const tag = fieldToTag(f, 6);
    if (tag) cardTags.push(tag);
  });

  const phaseAttr = phase ? `\n    phase: ${phase}` : '';
  const description = phase
    ? 'Additional items loaded on the client'
    : 'Initial items (rendered server-side)';

  return `  - tag: ${tagName}
    type: sub-contract
    repeated: true
    trackBy: _id${phaseAttr}
    description: ${description}
    tags:
${cardTags.join('\n')}`;
}
```

### Template Usage Example

```html
<!-- list page template -->
<section class="list-page">
  <!-- Initial items (slow-rendered) -->
  <article class="item-card" forEach="list.items" trackBy="_id">
    <a href="{url}" ref="list.items.itemLink">
      <h2>{title}</h2>
      <p>{excerpt}</p>
    </a>
  </article>

  <!-- Dynamically loaded items -->
  <article class="item-card" forEach="list.loadedItems" trackBy="_id">
    <a href="{url}" ref="list.loadedItems.itemLink">
      <h2>{title}</h2>
      <p>{excerpt}</p>
    </a>
  </article>

  <!-- Load more button -->
  <button
    ref="list.loadMoreButton"
    when="list.hasMore"
    is="true"
    class="{list.isLoading ? loading}"
  >
    {list.isLoading ? Loading... : Load More}
  </button>
</section>
```

## Implementation Plan

### Phase 1: Update Contract Generator

1. Modify `list-contract-generator.ts`:
   - Add `loadedItems` sub-contract with `phase: fast+interactive`
   - Add `loadedCount` data tag with `phase: fast+interactive`
   - Refactor `buildItemsSubContract` to accept tag name and optional phase

### Phase 2: Update Component

1. Modify `collection-list.ts`:
   - Update `ListSlowViewState` - keep only `items`
   - Update `ListFastViewState` - add `loadedItems`, `loadedCount`
   - Update `renderSlowlyChanging` - return only first page items
   - Update `renderFastChanging` - return empty `loadedItems`, `loadedCount: 0`
   - Update `ListInteractive` - append to `loadedItems`, update `loadedCount`

### Phase 3: Update contract-utils (if needed)

1. Add helper for phase-aware data tags:
   - `dataTagWithPhase(key, type, phase?, description?, indent?)`

### Phase 4: Update CMS Example Templates

1. Update `recipes/page.jay-html`:
   - Add `forEach="recipes.loadedItems"` section after `items`
   - Both sections use same card markup
2. Update `food-service-product-lines/page.jay-html`:
   - Add `forEach="productLines.loadedItems"` section after `items`
   - Both sections use same card markup

### Phase 5: Testing & Verification

1. Run `yarn dev` in `wix/examples/cms`
2. Navigate to `/recipes` and `/food-service-product-lines`
3. Verify first page renders (view source shows baked-in content)
4. Click "Load More" and verify additional items appear
5. Verify loaded items NOT in initial HTML source
6. Check browser console for any errors

## Trade-offs

| Decision                           | Pros                                               | Cons                               |
| ---------------------------------- | -------------------------------------------------- | ---------------------------------- |
| Separate `items` and `loadedItems` | Clear phase separation, matches wix-stores pattern | Two arrays to render in template   |
| Tags inline in both arrays         | No linked contract complexity                      | Some duplication in generated YAML |
| No sorting/filtering               | Simpler implementation                             | Limited functionality initially    |

## Verification Criteria

### Technical Verification

1. **Contract generation**: `items` has no phase (slow), `loadedItems` has `phase: fast+interactive`
2. **Slow render**: First page items rendered at build time
3. **Fast render**: `loadedItems` starts empty, `hasMore` set correctly
4. **Interactive**: Load more appends to `loadedItems`, not `items`
5. **Template works**: Both `forEach="items"` and `forEach="loadedItems"` render correctly

### CMS Example Verification

Use the `wix/examples/cms` project to verify the implementation works end-to-end.

#### Setup

```bash
cd wix/examples/cms
yarn dev
```

#### Test Cases

**Test 1: Recipes List Page - Initial Render**

1. Navigate to `http://localhost:3000/recipes`
2. Verify first page of recipes is rendered (check page source - items should be in HTML)
3. Count displayed recipe cards - should match `PAGE_SIZE` (e.g., 20)
4. "Load More Recipes" button visible if more items exist

**Test 2: Recipes List Page - Load More**

1. Click "Load More Recipes" button
2. Loading spinner appears
3. Additional recipe cards append below the first page
4. Button text updates or hides if no more items
5. Verify new items are NOT in initial HTML (dynamic render)

**Test 3: Product Lines List Page - Same Tests**

1. Navigate to `http://localhost:3000/food-service-product-lines`
2. Repeat Test 1 and Test 2 for product lines

**Test 4: View Page Source (Slow Render Verification)**

1. View page source for `/recipes`
2. First page recipe cards should have actual content (titles, images) baked in
3. `loadedItems` section should be empty in the HTML
4. `hasMore` should be set based on whether more items exist

**Test 5: Browser Dev Tools (Phase Verification)**

1. Open Network tab
2. Click "Load More"
3. Verify action request is made
4. Response contains only the next page items (not full page)

#### Template Update Required

Update `recipes/page.jay-html` to include both arrays:

```html
<!-- Initial items (slow-rendered) -->
<article class="recipe-card" forEach="recipes.items" trackBy="_id">...</article>

<!-- Dynamically loaded items -->
<article class="recipe-card" forEach="recipes.loadedItems" trackBy="_id">...</article>
```

Same update needed for `food-service-product-lines/page.jay-html`.

## Related Design Logs

- **Jay #50**: Rendering phases in contracts
- **Jay #75**: Slow rendering jay-html to jay-html
- **Wix #03**: Category pages (reference implementation)
- **Wix #05**: Wix Data plugin (original design)
