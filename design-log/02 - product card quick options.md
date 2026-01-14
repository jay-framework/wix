# Design Log 02: Product Card Quick Options

## Background

The store product page has "Add to Cart" buttons on product cards. However, for products with options (Size, Color) and modifiers, those must be selected before adding to cart.

The goal is to extend the product card with:
1. Options/variants data (from Wix Stores API)
2. A hover UI showing option buttons overlaying the product image
3. Replace simple "Add to Cart" with option selection when needed

Reference UI: Size buttons (XXS, XS, S, M, L, XL, XXL) appearing on hover over the product card image, with out-of-stock sizes greyed out.

## Problem

1. **Contract gap**: `product-card.jay-contract` lacks options/modifiers/variants data
2. **Duplicate contracts**: Options/modifiers are defined separately in `product-page.jay-contract`
3. **Data gap**: `stores-actions.ts` doesn't fetch options/variants for product cards
4. **UI gap**: `page.jay-html` has no hover controls for option selection

## Questions and Answers

**Q1: Should we consolidate options/modifiers contracts from product-card and product-page into a shared contract?**
A: Yes. Create a shared `product-options.jay-contract` that both can reference via `link:`.

**Q2: Should quick-add support ALL options or just the primary one (e.g., Size)?**
A: Only ONE option. Clicking a choice directly adds to cart (no two-step selection).

**Q3: What about products with only modifiers (no options)?**
A: Send to product page for full configuration.

**Q4: How should we handle multi-option products (Size + Color)?**
A: Send to product page for full configuration.

**Q5: Should we display option buttons on hover or always visible?**
A: On hover. The "Select {option}" hint is replaced by option buttons when hovering over the card.

## UX Summary

| Product Type | Behavior |
|--------------|----------|
| No options | Regular "Add to Cart" button |
| Single option | Option choices on hover, click = add to cart |
| Multiple options or modifiers | "View Options" button → product page |

## Proposed Design

### 1. Shared Contract: `product-options.jay-contract`

```yaml
name: product-options
tags:
  # Single option (Size, Color, etc.)
  - tag: _id
    type: data
    dataType: string
    description: Option GUID
    
  - tag: name
    type: data
    dataType: string
    description: "Option name (e.g., \"Size\", \"Color\")"
    
  - tag: optionRenderType
    type: variant
    dataType: enum (TEXT_CHOICES | COLOR_SWATCH_CHOICES)
    description: How the option should be rendered
    
  - tag: choices
    type: sub-contract
    repeated: true
    trackBy: choiceId
    description: Available choices for this option
    tags:
      - {tag: choiceId, type: data, dataType: string}
      - {tag: name, type: data, dataType: string, description: "Choice display name (e.g., \"XL\")"}
      - {tag: choiceType, type: variant, dataType: "enum (CHOICE_TEXT | ONE_COLOR)"}
      - {tag: colorCode, type: data, dataType: string, description: "HEX color (for swatches)"}
      - {tag: inStock, type: variant, dataType: boolean, phase: fast+interactive}
      - {tag: isSelected, type: variant, dataType: boolean, phase: fast+interactive}
      - {tag: choiceButton, type: interactive, elementType: HTMLButtonElement}
```

### 2. Extend `product-card.jay-contract`

Add these tags:

```yaml
  # Quick-add behavior variants
  - tag: quickAddType
    type: variant
    dataType: enum (SIMPLE | SINGLE_OPTION | NEEDS_CONFIGURATION)
    description: |
      SIMPLE = no options, show Add to Cart
      SINGLE_OPTION = one option, show choices on hover (click = add)
      NEEDS_CONFIGURATION = multiple options or modifiers, link to product page
    
  - tag: quickOption
    type: sub-contract
    description: Primary option for quick selection (only when quickAddType = SINGLE_OPTION)
    link: ./product-options

  - tag: viewOptionsButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to navigate to product page (when quickAddType = NEEDS_CONFIGURATION)
```

### 3. Update `stores-actions.ts` and `product-mapper.ts`

```typescript
// In queryProducts, add fields:
fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES']

// New enum for quick add behavior
enum QuickAddType {
  SIMPLE = 'SIMPLE',                    // No options
  SINGLE_OPTION = 'SINGLE_OPTION',      // One option, quick add on hover
  NEEDS_CONFIGURATION = 'NEEDS_CONFIGURATION'  // Multi-option or modifiers
}

// In mapProductToCard, add:
function getQuickAddType(product): QuickAddType {
  const optionCount = product.options?.length ?? 0;
  const hasModifiers = (product.modifiers?.length ?? 0) > 0;
  
  if (hasModifiers || optionCount > 1) return QuickAddType.NEEDS_CONFIGURATION;
  if (optionCount === 1) return QuickAddType.SINGLE_OPTION;
  return QuickAddType.SIMPLE;
}

quickAddType: getQuickAddType(product),
quickOption: product.options?.length === 1 
  ? mapQuickOption(product.options[0], product.variantsInfo) 
  : null,
```

### 4. Update `page.jay-html`

```html
<article class="product-card" forEach="productSearch.searchResults" trackBy="_id">
  <div class="product-card-wrapper">
    <a href="{productUrl}" class="product-card-image">
      <img src="{thumbnail.url}" alt="{thumbnail.altText}" loading="lazy" />
      <!-- Badges only - no overlay -->
      <span class="badge badge-accent ribbon" if="hasRibbon">{ribbon.name}</span>
    </a>
    
    <!-- Product content -->
    <div class="product-card-content">
      <!-- ... name, price content ... -->
      
      <!-- SIMPLE: Regular add to cart -->
      <button class="btn btn-secondary btn-block" 
        ref="productSearch.searchResults.addToCartButton"
        if="quickAddType === SIMPLE && inventory.availabilityStatus === IN_STOCK">
        Add to Cart
      </button>
      
      <!-- SINGLE_OPTION: Quick options in button area -->
      <div class="quick-options-area" if="quickAddType === SINGLE_OPTION">
        <!-- Default: "Select {option}" hint -->
        <span class="select-option-hint">Select {quickOption.name}</span>
        <!-- On hover: Show option buttons (replaces hint) -->
        <div class="quick-options-buttons">
          <button class="quick-option-btn {!inStock ? out-of-stock}"
            forEach="quickOption.choices" trackBy="choiceId"
            ref="productSearch.searchResults.quickOption.choices.choiceButton"
            disabled="{!inStock}">
            {name}
          </button>
        </div>
      </div>
      
      <!-- NEEDS_CONFIGURATION: Link to product page -->
      <a href="{productUrl}" class="btn btn-secondary btn-block"
        ref="productSearch.searchResults.viewOptionsButton"
        if="quickAddType === NEEDS_CONFIGURATION">
        View Options
      </a>
    </div>
  </div>
</article>
```

### 5. CSS for Hover Button Swap

```css
/* Container for hint + buttons */
.quick-options-area {
  position: relative;
  min-height: 48px;
}

/* "Select Color" hint - visible by default */
.select-option-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  transition: opacity 0.15s;
}

/* Hide hint on hover */
.product-card:hover .quick-options-area .select-option-hint {
  opacity: 0;
  pointer-events: none;
  position: absolute;
  inset: 0;
}

/* Option buttons - hidden by default */
.quick-options-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  position: absolute;
  inset: 0;
  transition: opacity 0.15s;
}

/* Show buttons on hover */
.product-card:hover .quick-options-buttons {
  opacity: 1;
  pointer-events: auto;
  position: relative;
}

.quick-option-btn {
  min-width: 48px;
  padding: 10px 16px;
  border: 2px solid var(--border);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
}

.quick-option-btn:hover:not(:disabled) {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.quick-option-btn.out-of-stock {
  opacity: 0.4;
  text-decoration: line-through;
}
```

## Implementation Plan

### Phase 1: Shared Contract
1. Create `product-options.jay-contract` with shared option/choice structure
2. Update `product-page.jay-contract` to use `link: ./product-options`
3. Extend `product-card.jay-contract` with `quickAddType`, `quickOption`, `viewOptionsButton`
4. Run contract type generation

### Phase 2: Action/Mapper Updates
1. Update `product-mapper.ts`:
   - Add `QuickAddType` enum
   - Add `getQuickAddType()` function
   - Add `mapQuickOption()` function (maps option + variants to choices with stock)
2. Update `searchProducts` and `getAllProducts` to include variant data fields

### Phase 3: Component Updates
1. Update `product-search.ts` interactive phase:
   - Handle `quickOption.choices.choiceButton.onclick` → find variant → add to cart
   - Handle `viewOptionsButton` (navigation to product page)

### Phase 4: HTML/CSS
1. Update `page.jay-html` with:
   - Quick options overlay for `SINGLE_OPTION`
   - "View Options" button for `NEEDS_CONFIGURATION`
   - Conditional rendering based on `quickAddType`
2. Add hover overlay CSS to `store-theme.css`
3. Test interactions

## Trade-offs

| Decision | Pros | Cons |
|----------|------|------|
| Single option only | Simple UI, one-click add | Multi-option products redirect to page |
| Click = Add (not select) | Faster UX, fewer clicks | No "preview" before add |
| Shared contract | DRY, consistency | Additional indirection |
| Buttons replace hint on hover | Cleaner than overlay, no image obstruction | Mobile shows only hint |
| "View Options" for complex | Clear expectation | Extra navigation step |

## Verification Criteria

1. **SIMPLE products**: Show regular "Add to Cart" button, clicking adds to cart
2. **SINGLE_OPTION products**: Show option choices on hover, clicking a choice adds that variant to cart
3. **NEEDS_CONFIGURATION products**: Show "View Options" button linking to product page
4. Out-of-stock choices appear disabled/greyed and cannot be clicked
5. Cart correctly receives the variant ID corresponding to the clicked choice
6. Cart indicator updates after successful add

---

## Implementation Results

### Files Created
- `wix/packages/wix-stores/lib/contracts/product-options.jay-contract` - Shared option/choice contract

### Files Modified
- `wix/packages/wix-stores/lib/contracts/product-card.jay-contract` - Added `quickAddType`, `quickOption`, `viewOptionsButton`
- `wix/packages/wix-stores/lib/utils/product-mapper.ts` - Added `getQuickAddType()`, `mapQuickOption()` functions
- `wix/packages/wix-stores/lib/actions/stores-actions.ts` - Added `VARIANT_OPTION_CHOICE_NAMES` to query fields
- `wix/packages/wix-stores/lib/components/product-search.ts` - Added quick option click and view options handlers
- `wix/examples/store/src/pages/products/page.jay-html` - Added quick options overlay and conditional buttons
- `wix/examples/store/src/styles/store-theme.css` - Added hover overlay styles

### Deviations from Design
- Did not update `product-page.jay-contract` to use shared contract (kept existing structure to minimize changes)
- Mobile fallback shows "Select {option name}" hint text instead of tap-to-reveal

### Next Steps
1. Run contract type generation to resolve linter errors
2. Test with real product data
3. Consider adding loading spinner to quick option buttons during add-to-cart
