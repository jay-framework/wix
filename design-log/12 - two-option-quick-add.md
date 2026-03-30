# 12 - Two-Option Quick Add (Color + Size)

## Status: Draft

## Background

Design Log 02 introduced quick-add for product cards with three behaviors:

- **SIMPLE** — no options, direct "Add to Cart" button
- **SINGLE_OPTION** — one option (e.g., Size), choices appear on hover, click = add to cart
- **NEEDS_CONFIGURATION** — multiple options or modifiers, "View Options" redirects to product page

Currently, products with exactly two options (e.g., Color + Size) fall into `NEEDS_CONFIGURATION` and redirect to the product page. This is the most common product configuration in fashion stores — every shirt, pants, or sweater has Color + Size.

## Problem

Fashion stores lose quick-add functionality for their most common product type. Users must navigate to the product page just to select color and size, adding friction to the purchase flow.

## Design

### New QuickAddType: `COLOR_AND_TEXT_OPTIONS`

When a product has exactly two options where:

1. One option has `optionRenderType: COLOR_SWATCH_CHOICES` (the color option)
2. The other has `optionRenderType: TEXT_CHOICES` (the text option, e.g. size)

The product gets `quickAddType: COLOR_AND_TEXT_OPTIONS` instead of `NEEDS_CONFIGURATION`.

### UX Behavior

1. **Color swatches** are shown as the primary quick option (`quickOption` — the first option)
2. The **first in-stock color** is pre-selected by default
3. The **text option** (second option) can be rendered as either **buttons** or a **dropdown**, depending on the template
4. When the user selects a **text choice** (button click or dropdown selection), the product is added to cart with both the pre-selected color and the selected text value
5. The user can change the color selection before selecting a text choice

### Two-Step Selection Flow

```
Product Card — buttons variant:
┌──────────────────────┐
│  [🔴] [🔵] [⚫]      │  ← color swatches (first = pre-selected)
│  [S] [M] [L] [XL]   │  ← text buttons (click = add to cart)
└──────────────────────┘

Product Card — dropdown variant:
┌──────────────────────┐
│  [🔴] [🔵] [⚫]      │  ← color swatches (first = pre-selected)
│  [ Select size  ▾ ]  │  ← dropdown (selection = add to cart)
└──────────────────────┘
```

- Clicking a color swatch → updates selection (visual feedback), does NOT add to cart
- Selecting a text choice (button click or dropdown selection) → adds to cart with selected color + chosen text value

### Contract Changes

Add `secondQuickOption` to `product-card.jay-contract`:

```yaml
- tag: quickAddType
  type: variant
  dataType: enum (SIMPLE | SINGLE_OPTION | COLOR_AND_TEXT_OPTIONS | NEEDS_CONFIGURATION)

- tag: quickOption
  type: sub-contract
  description: Primary option for quick selection (color swatches for COLOR_AND_TEXT_OPTIONS, or the single option for SINGLE_OPTION)
  link: ./product-options

- tag: secondQuickOption
  type: sub-contract
  description: Secondary option for quick selection (text choices for COLOR_AND_TEXT_OPTIONS). Rendered as buttons or dropdown. Selection adds to cart.
  link: ./product-options
```

The `quickOption` already has `isSelected` and `choiceButton` per choice. For `COLOR_AND_TEXT_OPTIONS`:

- `quickOption` = color (first in-stock choice has `isSelected: true`)
- `secondQuickOption` = size (clicking `choiceButton` adds to cart)

### Mapper Changes (`product-mapper.ts`)

Update `getQuickAddType`:

```typescript
function getQuickAddType(product): QuickAddType {
  const optionCount = product.options?.length ?? 0;
  const hasModifiers = (product.modifiers?.length ?? 0) > 0;

  if (hasModifiers || optionCount > 2) {
    return QuickAddType.NEEDS_CONFIGURATION;
  }
  if (optionCount === 2) {
    // Check if one is COLOR_SWATCH and one is TEXT_CHOICES
    const hasColor = product.options.some((o) => o.optionRenderType === 'COLOR_SWATCH_CHOICES');
    const hasText = product.options.some((o) => o.optionRenderType === 'TEXT_CHOICES');
    if (hasColor && hasText) {
      return QuickAddType.COLOR_AND_TEXT_OPTIONS;
    }
    return QuickAddType.NEEDS_CONFIGURATION;
  }
  if (optionCount === 1) {
    return QuickAddType.SINGLE_OPTION;
  }
  return QuickAddType.SIMPLE;
}
```

Update `mapProductToCard` to populate both options:

```typescript
// For COLOR_AND_TEXT_OPTIONS: color as quickOption (pre-selected), size as secondQuickOption
if (quickAddType === QuickAddType.COLOR_AND_TEXT_OPTIONS) {
  const colorOption = product.options.find((o) => o.optionRenderType === 'COLOR_SWATCH_CHOICES');
  const textOption = product.options.find((o) => o.optionRenderType === 'TEXT_CHOICES');
  quickOption = mapQuickOption(colorOption, product.variantsInfo);
  secondQuickOption = mapQuickOption(textOption, product.variantsInfo);

  // Pre-select first in-stock color
  if (quickOption?.choices) {
    const firstInStock = quickOption.choices.findIndex((c) => c.inStock);
    if (firstInStock >= 0) {
      quickOption.choices[firstInStock].isSelected = true;
    }
  }
}
```

### Interactive Changes (`product-search.ts`)

**Color swatch click** — toggle color selection (no add to cart):

```typescript
refs.searchResults.quickOption.choices.choiceButton.onclick(({ coordinate }) => {
  const [productId, choiceId] = coordinate;
  const product = searchResults().find((p) => p._id === productId);
  if (!product || product.quickAddType !== QuickAddType.COLOR_AND_TEXT_OPTIONS) {
    // Existing SINGLE_OPTION behavior: click = add to cart
    // ...
    return;
  }
  // COLOR_AND_TEXT_OPTIONS: toggle color selection
  updateColorSelection(productId, choiceId);
});
```

**Size click** — add to cart with both options:

```typescript
refs.searchResults.secondQuickOption.choices.choiceButton.onclick(({ coordinate }) => {
  const [productId, choiceId] = coordinate;
  const product = searchResults().find((p) => p._id === productId);
  if (!product) return;

  const colorOptionId = product.quickOption._id;
  const sizeOptionId = product.secondQuickOption._id;
  const selectedColor = product.quickOption.choices.find((c) => c.isSelected);

  await storesContext.addToCart(productId, 1, {
    options: {
      [colorOptionId]: selectedColor.choiceId,
      [sizeOptionId]: choiceId,
    },
    modifiers: {},
    customTextFields: {},
  });
});
```

### Stock Resolution per Variant

When a color is selected, the `inStock` status of each size choice should update based on the variant availability for that color+size combination. This requires variant data in the carry-forward.

For the slow phase, `inStock` reflects overall availability. In the interactive phase, when a color is selected, the component filters variants by the selected color and updates each size's `inStock` accordingly.

## Implementation Plan

### Phase 1: Contract

1. Add `COLOR_AND_TEXT_OPTIONS` to `quickAddType` enum
2. Add `secondQuickOption` sub-contract (link to product-options)
3. Regenerate types

### Phase 2: Mapper

1. Update `getQuickAddType` to detect color+text two-option products
2. Map both `quickOption` (color, pre-selected) and `secondQuickOption` (size)
3. Pre-select first in-stock color choice

### Phase 3: Interactive — Color Selection

1. Color swatch click toggles selection without adding to cart (for COLOR_AND_TEXT_OPTIONS)
2. Maintain backward compatibility: SINGLE_OPTION click still adds to cart

### Phase 4: Interactive — Size Add to Cart

1. Size button click adds to cart with both selected color + clicked size
2. Wire up `secondQuickOption.choices.choiceButton` handler

### Phase 5: Stock per Variant

1. When color changes, update size `inStock` based on variant availability
2. Requires variant data in carry-forward

## Trade-offs

### Pros

- Quick checkout for the most common fashion product type (color + size)
- Pre-selected color reduces clicks to purchase
- Backward compatible — SIMPLE and SINGLE_OPTION unchanged

### Cons

- More complex interactive logic for product cards
- Variant-level stock checking adds data to carry-forward
- Only supports color+text combination — other two-option combos still redirect

## Scope

- Only products with exactly 2 options: one COLOR_SWATCH + one TEXT_CHOICES
- Products with 2 TEXT options, 2 COLOR options, or any modifiers → still NEEDS_CONFIGURATION
- Stock-per-variant update (Phase 5) adds data to carry-forward but is necessary for correct UX
