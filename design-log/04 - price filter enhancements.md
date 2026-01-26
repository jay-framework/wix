# Design Log 04: Price Filter Enhancements

## Background

The current product search contract supports price filtering via two number input fields (`minPrice` and `maxPrice`). Users want more intuitive price filtering options:

1. **Pre-defined price ranges** - Radio buttons like "₪0-₪100", "₪100-₪200", etc.
2. **Dual price slider** - A range slider for visual min/max selection

Reference UI: Master of Malt style price filter with radio options for predefined ranges.

### API Discovery

The Wix `searchProducts` API supports **aggregations** in the same call:

```typescript
// From exploration/query-products-catalog-v3/query-playground.ts
await productsClient.searchProducts({
  aggregations: [
    // Get product counts per price bucket
    {
      fieldPath: 'actualPriceRange.minValue.amount',
      name: 'price-buckets',
      type: "RANGE",
      range: {
        buckets: [
          {from: 0, to: 50}, 
          {from: 50, to: 100}, 
          {from: 100, to: 200}
        ]
      }
    },
    // Get minimum price across all products
    {
      fieldPath: 'actualPriceRange.minValue.amount',
      name: 'min-price',
      type: "SCALAR",
      scalar: { type: "MIN" }
    },
    // Get maximum price across all products
    {
      fieldPath: 'actualPriceRange.minValue.amount',
      name: 'max-price',
      type: "SCALAR",
      scalar: { type: "MAX" }
    }
  ]
})
```

This allows us to:
- **Compute slider bounds** automatically from actual product data
- **Compute price buckets** with product counts per range
- **Single API call** for search + aggregations

**Important**: Only `searchProducts` supports aggregations. The current fast phase uses `queryProducts` which must be changed.

## Problem

1. **Contract limitation**: Current `priceRange` only supports free-form `minPrice`/`maxPrice` inputs
2. **No predefined ranges**: Cannot define store-specific price buckets
3. **No slider support**: No contract structure for range slider UI
4. **Dynamic bounds needed**: Slider min/max should come from actual product prices

## Questions and Answers

**Q1: Should predefined ranges be configurable per store or computed from API?**
A: Computed from API using aggregations. The `searchProducts` call will include RANGE aggregations with predefined buckets, returning product counts per bucket.

**Q2: Should we keep the existing min/max inputs alongside the new options?**
A: Yes. Offer three modes: (1) Input fields, (2) Radio ranges, (3) Dual slider. Store chooses which to use in their template.

**Q3: How should the dual slider bounds be determined?**
A: From the API using SCALAR MIN/MAX aggregations. The slider bounds are dynamically set from actual product prices.

**Q4: What happens when a range radio is selected?**
A: It sets the `minPrice` and `maxPrice` values internally and triggers a search.

**Q5: Should there be a "Show all" option?**
A: Yes, it clears both min and max price filters.

**Q6: Which store gets which UI?**
A: 
- `whisky-store` → Radio price ranges (Master of Malt style)
- `store` → Dual price slider

## Proposed Design

### 1. Extend `priceRange` Sub-contract

```yaml
# Price range filter (fast+interactive)
- tag: priceRange
  type: sub-contract
  phase: fast+interactive
  description: Price range filter
  tags:
    # Current filter values - works with <input type="number"> or <input type="range">
    - tag: minPrice
      type: [data, interactive]
      dataType: number
      elementType: HTMLInputElement
      description: Current minimum price filter value
      
    - tag: maxPrice
      type: [data, interactive]
      dataType: number
      elementType: HTMLInputElement
      description: Current maximum price filter value
      
    # Bounds for slider UI (from API aggregation)
    - tag: minBound
      type: data
      dataType: number
      phase: fast+interactive
      description: Absolute minimum from API (SCALAR MIN aggregation)
      
    - tag: maxBound
      type: data
      dataType: number
      phase: fast+interactive
      description: Absolute maximum from API (SCALAR MAX aggregation)
    
    # NEW: Predefined ranges (from API RANGE aggregation)
    - tag: ranges
      type: sub-contract
      repeated: true
      trackBy: rangeId
      phase: fast+interactive
      description: Price range buckets with product counts
      tags:
        - tag: rangeId
          type: data
          dataType: string
          description: Unique range identifier
          
        - tag: label
          type: data
          dataType: string
          description: Display label (e.g., "₪0 - ₪100")
          
        - tag: minValue
          type: data
          dataType: number
          description: Range minimum (null for "Show all")
          
        - tag: maxValue
          type: data
          dataType: number
          description: Range maximum (null for open-ended like "₪400+")
          
        - tag: productCount
          type: data
          dataType: number
          description: Number of products in this price range (from aggregation)
          
        - tag: isSelected
          type: [data, interactive]
          dataType: boolean
          elementType: HTMLInputElement
          description: Radio button for this range
```

### 2. HTML Usage Examples

#### Radio Button Ranges (whisky-store)
```html
<div class="filter-section">
  <div class="filter-header">
    <span class="filter-title">Price</span>
    <span class="filter-toggle">▲</span>
  </div>
  <div class="filter-options">
    <label class="filter-option"
           forEach="productSearch.filters.priceRange.ranges"
           trackBy="rangeId">
      <input type="radio" 
             name="priceRange"
             ref="productSearch.filters.priceRange.ranges.isSelected" />
      <span>{label}</span>
      <span class="count" if="productCount">({productCount})</span>
    </label>
  </div>
</div>
```

#### Dual Slider (store example)
```html
<div class="filter-section">
  <div class="filter-title">Price Range</div>
  <div class="price-slider">
    <div class="slider-values">
      <span class="slider-value-min">{productSearch.filters.priceRange.minPrice}</span>
      <span class="slider-value-max">{productSearch.filters.priceRange.maxPrice}</span>
    </div>
    <div class="slider-track">
      <input type="range" 
             class="slider-handle slider-min"
             min="{productSearch.filters.priceRange.minBound}"
             max="{productSearch.filters.priceRange.maxBound}"
             value="{productSearch.filters.priceRange.minPrice}"
             ref="productSearch.filters.priceRange.minPrice" />
      <input type="range" 
             class="slider-handle slider-max"
             min="{productSearch.filters.priceRange.minBound}"
             max="{productSearch.filters.priceRange.maxBound}"
             value="{productSearch.filters.priceRange.maxPrice}"
             ref="productSearch.filters.priceRange.maxPrice" />
    </div>
  </div>
</div>
```

### 3. CSS for Dual Slider

```css
/* Dual range slider */
.price-slider {
  padding: 20px 0;
}

.slider-track {
  position: relative;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
}

.slider-track input[type="range"] {
  position: absolute;
  width: 100%;
  height: 6px;
  background: transparent;
  pointer-events: none;
  -webkit-appearance: none;
  appearance: none;
}

.slider-track input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  background: var(--navy);
  border-radius: 50%;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
}

.slider-track input[type="range"]::-moz-range-thumb {
  width: 20px;
  height: 20px;
  background: var(--navy);
  border-radius: 50%;
  cursor: pointer;
  pointer-events: auto;
  border: none;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  font-size: 14px;
  color: var(--text-secondary);
}
```

### 4. API Integration in `stores-actions.ts`

```typescript
// Logarithmic price bucket boundaries: 0, 20, 40, 100, 200, 400, 1000, 2000, 4000, 10000...
// Each power of 10 is divided into 3 buckets using multipliers 2, 4, 10
const PRICE_BUCKET_BOUNDARIES = [0, 20, 40, 100, 200, 400, 1000, 2000, 4000, 10000, 20000, 40000, 100000];

const PRICE_BUCKETS = PRICE_BUCKET_BOUNDARIES.slice(0, -1).map((from, i) => ({
    from,
    to: PRICE_BUCKET_BOUNDARIES[i + 1]
}));
// Add open-ended last bucket
PRICE_BUCKETS.push({ from: 100000 });

// In searchProducts call, add aggregations:
const response = await productsClient.searchProducts({
  filter,
  cursorPaging,
  sort,
  aggregations: [
    // Price buckets with product counts
    {
      fieldPath: 'actualPriceRange.minValue.amount',
      name: 'price-buckets',
      type: "RANGE",
      range: { buckets: PRICE_BUCKETS }
    },
    // Min price for slider bound
    {
      fieldPath: 'actualPriceRange.minValue.amount',
      name: 'min-price',
      type: "SCALAR",
      scalar: { type: "MIN" }
    },
    // Max price for slider bound
    {
      fieldPath: 'actualPriceRange.minValue.amount',
      name: 'max-price',
      type: "SCALAR",
      scalar: { type: "MAX" }
    }
  ]
}, { fields: [...] });

// Extract aggregation results
const aggregations = response.aggregationData?.results;
const minPrice = aggregations?.find(a => a.name === 'min-price')?.scalar?.value;
const maxPrice = aggregations?.find(a => a.name === 'max-price')?.scalar?.value;
const buckets = aggregations?.find(a => a.name === 'price-buckets')?.range?.buckets;
```

### 5. Mapping Aggregation Results

```typescript
function mapPriceRanges(buckets: any[], currency: string): PriceRange[] {
  const ranges: PriceRange[] = [
    { rangeId: 'all', label: 'Show all', minValue: null, maxValue: null, productCount: null, isSelected: true }
  ];
  
  for (const bucket of buckets) {
    const from = bucket.from ?? 0;
    const to = bucket.to;
    const count = bucket.count ?? 0;
    
    // Skip empty buckets
    if (count === 0) continue;
    
    const label = to 
      ? `${currency}${from} - ${currency}${to}`
      : `${currency}${from}+`;
    
    ranges.push({
      rangeId: `${from}-${to ?? 'plus'}`,
      label,
      minValue: from,
      maxValue: to ?? null,
      productCount: count,
      isSelected: false
    });
  }
  
  return ranges;
}
```

### 6. Implementation in `product-search.ts`

```typescript
// Handle range radio selection
for (const range of viewState.priceRange.ranges) {
  range.isSelected.onChange = () => {
    if (range.isSelected.value) {
      // Deselect other ranges
      viewState.priceRange.ranges.forEach(r => {
        if (r.rangeId !== range.rangeId) r.isSelected.value = false;
      });
      // Set price filter values
      viewState.priceRange.minPrice.value = range.minValue;
      viewState.priceRange.maxPrice.value = range.maxValue;
      // Trigger search
      performSearch();
    }
  };
}

// Handle slider changes (with debounce) - uses same minPrice/maxPrice tags
let sliderDebounce: NodeJS.Timeout;
const handleSliderChange = () => {
  clearTimeout(sliderDebounce);
  sliderDebounce = setTimeout(() => {
    performSearch();
  }, 300); // 300ms debounce
};

// When bound to <input type="range">, the same onChange works
viewState.priceRange.minPrice.onChange = handleSliderChange;
viewState.priceRange.maxPrice.onChange = handleSliderChange;
```

## Implementation Plan

### Phase 1: Contract Extension
1. Update `product-search.jay-contract` with new `priceRange` tags:
   - Add `minBound`, `maxBound` for dynamic slider bounds
   - Add `ranges` repeated sub-contract with `productCount`
   - Existing `minPrice`/`maxPrice` work for both number inputs and range sliders
2. Run contract type generation

### Phase 2: API Integration
1. **Change fast phase from `queryProducts` to `searchProducts`**:
   - Currently `product-search.ts` line 126 uses `wixStores.products.queryProducts()`
   - Must change to `searchProducts` to get aggregations
   - Only `searchProducts` supports the `aggregations` parameter
2. Update `stores-actions.ts`:
   - Add aggregations to `searchProducts` call
   - Define logarithmic `PRICE_BUCKETS` (0-20, 20-40, 40-100, 100-200, etc.)
   - Extract min/max prices and bucket counts from response
   - Filter out empty buckets from results
   - Map buckets to `PriceRangeBucket[]` with currency-formatted labels

### Phase 3: Component Implementation
1. Update `product-search.ts`:
   - Populate `sliderMinBound`/`sliderMaxBound` from API
   - Populate `ranges` from aggregation results
   - Handle range radio selection → set min/max → search
   - Handle slider change (with debounce) → set min/max → search

### Phase 4: HTML/CSS Updates
1. **whisky-store**: Update products page with radio price ranges
   - Show product count in parentheses: "₪0 - ₪100 (12)"
2. **store**: Update products page with dual slider
   - Add slider CSS to theme
3. Test both filter modes

## Trade-offs

| Decision | Pros | Cons |
|----------|------|------|
| Keep all three modes | Flexibility for different stores | More complex contract |
| Radio sets min/max internally | Clean separation | Hidden state sync |
| Configurable ranges | Store-specific buckets | Requires initialization logic |
| CSS-only dual slider | No JS library needed | Limited styling options |

## Verification Criteria

1. **API aggregations**: Search response includes min-price, max-price, and bucket counts
2. **Bounds**: `minBound`/`maxBound` populated from API scalar aggregations
3. **Range options**: `ranges` array populated from API range aggregation with product counts
4. **Radio ranges**: Clicking a range updates minPrice/maxPrice and filters products
5. **Product counts**: Each range shows "(N)" count from aggregation
6. **"Show all"**: Clears price filter, shows all products
7. **Dual slider**: Binding minPrice/maxPrice to `<input type="range">` works with debounce
8. **whisky-store**: Shows radio price ranges
9. **store**: Shows dual slider
