# 14 - Option-Based Product Filters

## Status: Implemented (static filter lists — draft)

## Background

The product search component currently supports filtering by:
- **Price range** — computed from search API aggregations
- **Categories** — loaded from the Wix Categories API
- **In-stock** — simple boolean filter

Many stores also need to filter by **product options** — e.g., filter by Color=Red or Size=M. The Wix Catalog V3 `searchProducts` API supports filtering by option name and choice values:

```typescript
// Filter products with color "Black"
filter: {
    'options.name': { $hasSome: ['Color'] },
    'options.choicesSettings.choices.name': { $hasSome: ['Black'] },
}
```

## Problem

The search API can aggregate option names and choice names, but it returns them as **flat lists** — there's no way to know which choice belongs to which option from the aggregation alone.

```
optionNames: ["Color", "Size"]
choiceNames: ["Red", "Blue", "S", "M", "L", "XL"]
// Which choices belong to which option? Unknown from aggregation.
```

We need structured filter data: Color → [Red, Blue, ...], Size → [S, M, L, XL].

## Design

### Two-Source Approach

Combine two data sources to build structured option filters:

1. **Customizations API** (`customizationsV3.queryCustomizations`) — returns all product options with their choices, organized by option. Loaded once on service startup, cached.

2. **Search API aggregations** (`optionNames` + `choiceNames`) — returns which option names and choice names actually exist for products in the current query/category. Already part of `searchProducts`.

Cross-referencing these gives us structured filters scoped to the current results:

```
Customizations (all options):
  Color → [Red, Blue, Green, Yellow, Black, White]
  Size → [XS, S, M, L, XL, XXL]

Search aggregation (current category):
  optionNames: [Color, Size]
  choiceNames: [Red, Blue, S, M, L]

Result (filtered):
  Color → [Red, Blue]
  Size → [S, M, L]
```

### Customizations Loading

Load customizations once on service startup and cache on the `WixStoresService`:

```typescript
export interface WixStoresService {
    // ... existing ...
    /** Cached product customizations (options with choices). Lazily loaded. */
    getCustomizations(): Promise<Customization[]>;
}
```

### Search Aggregation Changes

Add `optionNames` and `choiceNames` aggregations to the existing `searchProducts` aggregation list:

```typescript
const aggregations = [
    // ... existing price aggregations ...
    {
        fieldPath: 'options.name',
        name: 'optionNames',
        type: 'VALUE',
        value: { limit: 20, sortType: 'VALUE', sortDirection: 'DESC' },
    },
    {
        fieldPath: 'options.choicesSettings.choices.name',
        name: 'choiceNames',
        type: 'VALUE',
        value: { limit: 50, sortType: 'VALUE', sortDirection: 'DESC' },
    },
];
```

### Building Structured Filters

Cross-reference customizations with aggregation results:

```typescript
function getAvailableProductOptions(
    aggregationResults: AggregationResults[],
    customizations: Customization[],
): ProductOptionFilter[] {
    // Extract option names and choice names with counts from aggregation
    const optionEntries = extractValuesWithCounts(aggregationResults, 'optionNames');
    const choiceEntries = extractValuesWithCounts(aggregationResults, 'choiceNames');
    const optionNames = new Set(optionEntries.map(e => e.value));
    const choiceCounts = new Map(choiceEntries.map(e => [e.value.toLowerCase(), e.count]));

    return customizations
        // Only PRODUCT_OPTION type, only options present in aggregation
        .filter(c =>
            c.customizationType === 'PRODUCT_OPTION' &&
            optionNames.has(c.name)
        )
        .map(c => ({
            id: c._id,
            name: c.name,
            renderType: c.customizationRenderType,
            choices: c.choicesSettings.choices
                .filter(ch => choiceCounts.has(ch.name.toLowerCase()))
                .map(ch => ({
                    id: ch._id,
                    name: ch.name,
                    colorCode: ch.colorCode,
                    productCount: choiceCounts.get(ch.name.toLowerCase()) ?? 0,
                }))
                // Sort by product count descending (most used first)
                .sort((a, b) => b.productCount - a.productCount),
        }))
        .filter(o => o.choices.length > 0);
}
```

### Contract Changes

Add `optionFilters` to the product-search contract filters:

```yaml
- tag: optionFilters
  type: sub-contract
  repeated: true
  trackBy: optionId
  description: Filter by product options (e.g., Color, Size)
  tags:
    - tag: optionId
      type: data
      dataType: string

    - tag: optionName
      type: data
      dataType: string

    - tag: optionRenderType
      type: variant
      dataType: enum (TEXT_CHOICES | SWATCH_CHOICES)

    - tag: choices
      type: sub-contract
      repeated: true
      trackBy: choiceId
      tags:
        - tag: choiceId
          type: data
          dataType: string

        - tag: choiceName
          type: data
          dataType: string

        - tag: colorCode
          type: data
          dataType: string
          description: HEX color code (for swatch rendering)

        - tag: productCount
          type: data
          dataType: number
          phase: fast+interactive
          description: Number of products with this choice in current results

        - tag: isSelected
          type: variant
          dataType: boolean
          phase: fast+interactive

        - tag: choiceCheckbox
          type: interactive
          elementType: HTMLInputElement
          description: Checkbox to toggle this choice filter
```

### Search Filter Application

When option filters are selected, use OR semantics within each option (e.g., Color=Red OR Blue):

```typescript
// For each option with selected choices, filter products that have ANY of the selected values
const optionFilters = selectedOptions.map(option => ({
    $and: [
        { 'options.name': { $hasSome: [option.name] } },
        { 'options.choicesSettings.choices.name': { $hasSome: option.selectedChoices } },
    ],
}));
// Multiple options are AND-ed together (e.g., Color=Red AND Size=M)
```

### Data Flow

```
Service Startup:
  customizationsV3.queryCustomizations() → cached on service

Slow Phase:
  (customizations already cached)

Fast Phase (searchProducts):
  aggregations include optionNames + choiceNames
  → cross-reference with cached customizations
  → structured optionFilters in view state

Interactive Phase:
  user clicks choice → update isSelected → trigger search with option filter
```

## Implementation Plan

### Phase 1: Customizations on Service
1. Add `customizationsV3` client to `WixStoresService`
2. Add `getCustomizations()` with lazy loading and caching
3. Load `PRODUCT_OPTION` customizations only

### Phase 2: Search Aggregation
1. Add `optionNames` and `choiceNames` aggregations to `searchProducts`
2. Return aggregation results alongside products

### Phase 3: Contract
1. Add `optionFilters` sub-contract to product-search filters
2. Regenerate types

### Phase 4: Mapper
1. Build `getAvailableProductOptions()` from aggregation + customizations
2. Sort choices by product count descending (most used first)
3. Include product count per choice from aggregation data
4. Populate `optionFilters` in search output

### Phase 5: Interactive — Filter Selection
1. Choice checkbox toggles `isSelected`
2. Trigger search with option filter applied (OR within option, AND across options)
3. URL persistence for selected options

## Trade-offs

### Pros
- Structured option filters (choices grouped by option)
- Scoped to current results (only shows relevant options/choices)
- Customizations loaded once (cached), aggregations are lightweight
- Supports both swatch and text rendering

### Cons
- Requires two data sources (customizations + aggregation)
- Customizations cache may become stale (options added/removed)
- Aggregation limits (20 option names, 50 choice names) may truncate large catalogs

### Known Limitations

**Choice name collision across options.** The `choiceNames` VALUE aggregation returns a flat list across all options. If two different options share a choice name (e.g., Size has "M" and Material has "M"), their counts are combined into a single aggregation entry. The customization cross-reference correctly assigns each choice to the right option, but the `productCount` may be inflated for colliding names. A nested aggregation (VALUE on `options.name` → VALUE on choices) would fix this, but it's unclear whether the Wix search API supports nesting on these repeated sub-fields. In practice, choice name collisions across options are rare.

## Answers

1. **Choice sorting**: Preserve the customization order from the Wix Customizations API. The `choicesSettings.choices` array comes in the store owner's configured order (manual, alphabetical, or by product count — as set in Wix dashboard). We overlay live `productCount` values but do not re-sort by them.
2. **Product counts**: Yes — the aggregation `values.results` includes a `count` field per value. Exposed as `productCount` on each choice.
3. **Multi-selection**: OR within an option (Color=Red OR Blue), AND across options (Color=Red AND Size=M).

## Implementation Results

### Files Modified

| File | Change |
|------|--------|
| `packages/wix-stores/lib/utils/wix-store-api.ts` | Added `getCustomizationsV3Client()` singleton factory |
| `packages/wix-stores/lib/services/wix-stores-service.ts` | Added `customizations` client + `getCustomizations()` lazy-cached method |
| `packages/wix-stores/lib/actions/stores-actions.ts` | Added option aggregations, filter input/output types, `getAvailableProductOptions()` |
| `packages/wix-stores/lib/contracts/product-search.jay-contract` | Added `optionFilters` sub-contract to filters |
| `packages/wix-stores/lib/components/product-search.ts` | Interactive: checkbox toggle, URL persistence, search with options, clear filters |
| `packages/wix-stores/lib/actions/search-products.jay-action` | Updated input/output schemas with `optionFilters` |

### Deviations from Design

1. **Contract `isSelected` tag**: Changed from `type: variant` to `type: [data, interactive]` with `elementType: HTMLInputElement` — makes it a checkbox that can be bound to an `<input>` element and also carries data. Removed explicit `phase: fast+interactive` since the `interactive` type implicitly sets this.
2. **Removed `choiceCheckbox` tag**: The `isSelected` tag with `type: [data, interactive]` serves both as the data carrier and the interactive element, so a separate `choiceCheckbox` tag is unnecessary.
3. **`queryCustomizations()` call**: Called without arguments instead of `queryCustomizations({})` — the `{}` argument matched the wrong overload (query overload returning a Promise instead of builder overload returning `CustomizationsQueryBuilder`).
4. **URL encoding**: Option filter URL param uses `encodeURIComponent` for option names and choice names to handle special characters safely.

### Verification

- `yarn definitions` — generates updated `.d.ts` files successfully
- `npx tsc --noEmit` — 0 type errors

## Static Filter Lists with Live Counts

### Problem

The current implementation runs all aggregations against the fully-filtered result set. When a user selects Color=Red, the Size choices update to only show sizes available in red products — and Color choices also collapse to only show "Red". Filter values disappear mid-browsing, which is disorienting.

### Design

Different filter types need different aggregation strategies:

**Price filter** — always reflects the fully-filtered set. When the user narrows by category or option, the price range should shrink to match. This is the current behavior and is correct.

**Categories and option choices** — the list of values stays **static** (established from the initial unfiltered search). Counts update to reflect the current filtered set, and choices with count=0 become **disabled**. Users see the full option landscape at all times but know which combinations are empty.

### Behavior

```
Initial load (no filters):
  Color: Red (15), Blue (12), Green (8), Black (5)
  Size:  S (10), M (18), L (14), XL (3)

User selects Color=Red:
  Color: Red (15), Blue (12), Green (8), Black (5)    ← unchanged, from base list
  Size:  S (4), M (8), L (3), XL (0 disabled)         ← counts from filtered aggregation

User also selects Size=M:
  Color: Red (8), Blue (5), Green (3), Black (0 disabled)  ← counts reflect Size=M
  Size:  S (4), M (8), L (3), XL (0 disabled)              ← counts reflect Color=Red
```

### Implementation Approach

**Base list**: Established from the **slow phase's unfiltered search**. The slow phase always runs `searchProducts` with no user filters (only the base category scope if any). This result is already carried forward to the fast phase via `preloadedResult`. The option filters and category counts from this unfiltered result become the canonical base lists — even when the fast phase runs a second filtered search due to URL params.

**Filtered counts**: Every subsequent search (fast phase with URL filters, or interactive phase) still returns aggregations. The component merges filtered counts into the base list:
- Choice present in aggregation → update `productCount`
- Choice absent from aggregation → set `productCount = 0`, `isDisabled = true`

**No extra API calls**: The base list comes from the slow phase search that already runs unconditionally. The fast and interactive phases merge counts from their filtered searches into it.

### Contract Changes

Add `isDisabled` to option filter choices and category filter:

```yaml
# In optionFilters > choices:
- tag: isDisabled
  type: data
  dataType: boolean
  phase: fast+interactive
  description: Whether this choice has no matching products (count=0)

# In categoryFilter > categories:
- tag: productCount
  type: data
  dataType: number
  phase: fast+interactive
  description: Number of products in this category with current filters

- tag: isDisabled
  type: data
  dataType: boolean
  phase: fast+interactive
  description: Whether this category has no matching products (count=0)
```

### Data Flow

```
Slow phase (always unfiltered, only base category scope):
  searchProducts(no filters) → aggregations
  → base optionFilters list (full choices with unfiltered counts)
  → base category counts
  Stored in preloadedResult carry-forward

Fast phase:
  If no URL filters → use preloadedResult directly, base lists = preloaded
  If URL filters → run filtered searchProducts
    → merge filtered counts into base lists from preloadedResult
    → choices absent from filtered aggregation → count=0, disabled
  Price range: always from the current (possibly filtered) aggregation

Interactive phase (user applies filters):
  searchProducts → new aggregations
  Merge new counts into base lists (carried forward from slow):
    - for each base choice/category:
        find matching entry in new aggregation
        update productCount (or 0 if absent)
        set isDisabled = (productCount === 0)
  Price range: use new aggregation directly (not merged)
```

### Aggregation for Categories

Currently categories don't have aggregation counts. Need to add a VALUE aggregation on category IDs:

```typescript
{
    fieldPath: 'allCategoriesInfo.categories.id',
    name: 'categoryIds',
    type: 'VALUE',
    value: { limit: 50, sortType: 'VALUE', sortDirection: 'DESC' },
}
```

This returns `{ value: categoryId, count: N }` per category, which can be merged into the base category list.

### Files to Modify

1. **`product-search.jay-contract`** — add `isDisabled` to option choices and categories, add `productCount` to categories
2. **`stores-actions.ts`** — add category VALUE aggregation, return category counts in output
3. **`product-search.ts`** — store base lists from initial search, merge filtered counts on subsequent searches
4. **`search-products.jay-action`** — update output schema
