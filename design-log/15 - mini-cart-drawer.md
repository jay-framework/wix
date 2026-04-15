# 15 - Mini Cart Drawer

## Status: Draft

## Background

When a user adds a product to the cart from a search or category page, there's no immediate visual feedback beyond the cart indicator count incrementing. The user has to navigate to the cart page to see what they added. This breaks the shopping flow — users want to confirm the item was added and optionally continue shopping.

## Problem

We need a mini-cart drawer that:
1. Automatically opens when a product is added to cart
2. Shows the cart contents (delegated to whatever the template author places inside)
3. Can be closed by clicking a close button
4. Can be opened manually via an `openButton` (e.g., wired from the cart-indicator)
5. Lives in the `wix-cart` package since it's cart-triggered, not store-specific

## Design

### Approach: Container Component

The mini-cart is a **container component** — it controls open/close visibility but doesn't render cart contents itself. The template author places a `cart-page` (or any other content) inside the mini-cart's slot. This keeps the component simple and flexible.

```html
<head>
  <script type="application/jay-headless" plugin="@jay-framework/wix-cart" contract="cart-indicator" key="cart"></script>
  <script type="application/jay-headless" plugin="@jay-framework/wix-cart" contract="mini-cart" key="mc"></script>
  <script type="application/jay-headless" plugin="@jay-framework/wix-cart" contract="cart-page" key="cartPage"></script>
</head>
<body>
  <!-- Header with cart indicator that opens the drawer -->
  <header>
    <a ref="cart.cartLink" href="/cart" class="cart-indicator">
      Cart <span if="cart.hasItems">({cart.itemCount})</span>
    </a>
    <button ref="mc.openButton" class="cart-icon">🛒</button>
  </header>

  <!-- Mini-cart drawer — auto-opens on add-to-cart -->
  <div if="mc.isOpen" class="mini-cart-overlay">
    <div class="mini-cart-drawer">
      <button ref="mc.closeButton">×</button>
      <!-- Cart content nested inside -->
      <h3>Your Cart ({cartPage.summary.itemCount})</h3>
      <div forEach="cartPage.lineItems" trackBy="lineItemId">
        <span>{cartPage.lineItems.productName}</span>
        <span>{cartPage.lineItems.unitPrice.formattedAmount}</span>
      </div>
      <a href="/cart">View Full Cart</a>
    </div>
  </div>
</body>
```

### Contract

```yaml
name: mini-cart
description: Drawer that auto-opens when a product is added to cart. Place cart content inside.
tags:
  - tag: isOpen
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether the mini-cart drawer is currently open

  - tag: openButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to manually open the mini-cart drawer

  - tag: closeButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to close the mini-cart drawer
```

Minimal contract — just open/close state and two buttons. The cart content is handled by whatever component the template author nests inside.

### Trigger Mechanism

The mini-cart watches the cart indicator's `itemCount` signal (from `WixCartContext`). When the count increases, it opens. This is the same signal the cart-indicator already uses for its `justAdded` animation.

```
User clicks "Add to Cart" on product card
  → storesContext.addToCart()
    → cartContext.addToCart()
      → updates cartIndicator.itemCount signal
        → cart-indicator: triggers justAdded animation
        → mini-cart: opens drawer (isOpen = true)
```

### Open/Close Behavior

The drawer opens when:
1. An item is added to cart (itemCount increases)
2. User clicks `openButton`

The drawer closes when:
1. User clicks `closeButton`

### Component Implementation

```typescript
// Phases:
// - Slow: nothing
// - Fast: isOpen = false
// - Interactive: watch itemCount, open on increase, open/close on button clicks

function MiniCartInteractive(props, refs, viewStateSignals, carryForward, cartContext) {
    const { isOpen: [isOpen, setIsOpen] } = viewStateSignals;
    let prevItemCount = cartContext.cartIndicator.itemCount();

    // Open when item count increases
    createMemo(() => {
        const currentCount = cartContext.cartIndicator.itemCount();
        if (currentCount > prevItemCount) {
            setIsOpen(true);
        }
        prevItemCount = currentCount;
    });

    // Open button
    refs.openButton.onclick(() => {
        setIsOpen(true);
    });

    // Close button
    refs.closeButton.onclick(() => {
        setIsOpen(false);
    });
}
```

### Cart-Indicator Integration

The `openButton` on the mini-cart contract provides a template-level "config" for whether the cart indicator opens the drawer. If the template wires the cart indicator's button to `mc.openButton`, it opens the drawer. If not, the indicator just links to the cart page. No code-level configuration needed.

### Data Flow

```
Fast phase:
  isOpen = false (drawer hidden on page load)

Interactive phase:
  cartContext.cartIndicator.itemCount signal changes
    → if count increased → setIsOpen(true)
  openButton click → setIsOpen(true)
  closeButton click → setIsOpen(false)
```

## Implementation Plan

### Phase 1: Contract & Component
1. Create `mini-cart.jay-contract` in `packages/wix-cart/lib/contracts/`
2. Create `mini-cart.ts` component in `packages/wix-cart/lib/components/`
3. Register in `plugin.yaml`
4. Export from `index.ts` and `index.client.ts`
5. Add contract export to `package.json`
6. Run `yarn definitions`

### Files to Create/Modify

1. **Create** `packages/wix-cart/lib/contracts/mini-cart.jay-contract`
2. **Create** `packages/wix-cart/lib/components/mini-cart.ts`
3. **Modify** `packages/wix-cart/plugin.yaml` — add mini-cart entry
4. **Modify** `packages/wix-cart/lib/index.ts` — export mini-cart component
5. **Modify** `packages/wix-cart/lib/index.client.ts` — export mini-cart client component
6. **Modify** `packages/wix-cart/package.json` — add contract export

## Trade-offs

### Pros
- Minimal contract — the template controls all visual aspects
- Reuses existing `cartIndicator.itemCount` signal — no new API calls
- Works with any cart content (cart-page, custom summary, etc.)
- Same trigger mechanism as cart-indicator's `justAdded` — proven pattern
- Template-level "config" via `openButton` — no code configuration needed

### Cons
- No built-in cart content — requires template author to nest a cart-page or similar
- Opening on every add-to-cart may be disruptive for bulk-adding users (could be mitigated with a debounce or "don't show again" pattern in the template)

## Answers

1. **Cart-indicator opening drawer**: Not via code configuration. Instead, the mini-cart exposes an `openButton` interactive tag. If the template wires a button to it, that button opens the drawer. This is template-level configuration — no code config needed.
2. **Manual open**: Yes — `openButton` interactive tag added to the contract.
