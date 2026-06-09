# @jay-framework/wix-cart

Shared cart and checkout package for Jay Framework Wix integrations. Provides headless cart components with server-side rendering and client-side interactivity, plus checkout redirect to Wix's hosted checkout.

## Features

- **Cart page** — Full cart with line items, quantity controls, coupon codes, and estimated totals
- **Cart indicator** — Reactive badge showing item count (updates automatically on add/remove)
- **Mini cart** — Compact cart drawer/modal
- **Checkout redirect** — Creates a checkout from the current cart and redirects to Wix's hosted checkout page
- **Three-phase rendering** — Slow (build), Fast (request/SSR), Interactive (client)
- **Shared across stores packages** — Used by both `@jay-framework/wix-stores` and `@jay-framework/wix-stores-v1`

## Configuration

### `config/.wix-cart.yaml`

Optional configuration file. Created automatically by `jay-stack-cli setup` if missing.

```yaml
# Checkout callback URLs
urls:
  thankYou: "/thank-you"    # Where Wix redirects after successful checkout (default: /thank-you)
```

## Headless Components

### Cart Page (`cart-page`)

Full shopping cart with line item management and checkout.

- **Slow phase**: Cart ID, empty cart message
- **Fast phase**: Loading state
- **Interactive**: Line items (quantity, remove), coupon input, checkout button

Key interactions:
- `checkoutButton` — Creates a Wix checkout and redirects to hosted checkout
- `continueShoppingLink` — Link back to products
- `clearCartButton` — Remove all items
- Quantity increment/decrement per line item
- Coupon apply/remove

### Cart Indicator (`cart-indicator`)

Header badge showing cart item count.

- **Fast+Interactive**: `itemCount`, `hasItems`, `isLoading`, `justAdded`
- Reactive — updates automatically when items are added/removed from any page

### Mini Cart (`mini-cart`)

Compact cart for drawer/modal display. Same data as cart-page in a condensed format.

## Checkout Flow

The checkout button triggers a redirect to Wix's hosted checkout:

1. `createCheckoutFromCurrentCart()` — creates a Wix checkout from the current cart
2. `createRedirectSession({ ecomCheckout: { checkoutId } })` — gets a redirect URL
3. Browser navigates to Wix checkout — payment, shipping, order review
4. After completion, Wix redirects to the configured `thankYou` URL

No PCI compliance or payment integration needed — Wix handles everything.

## Services & Contexts

### `WIX_CART_SERVICE` (server)

Server-side cart operations using API key authentication.

```typescript
import { WIX_CART_SERVICE } from '@jay-framework/wix-cart';

// Available in .withServices(WIX_CART_SERVICE)
interface WixCartService {
    cart: CurrentCartClient;       // @wix/ecom currentCart
    redirects: RedirectsClient;    // @wix/redirects
    urls: { thankYou: string };    // Configured URLs
}
```

### `WIX_CART_CONTEXT` (client)

Client-side cart operations using OAuth authentication.

```typescript
import { WIX_CART_CONTEXT } from '@jay-framework/wix-cart';

// Available in useContext(WIX_CART_CONTEXT)
interface WixCartContext {
    cartIndicator: { itemCount: Getter<number>; hasItems: Getter<boolean> };
    refreshCartIndicator(): Promise<void>;
    getEstimatedCart(): Promise<CartState>;
    addToCart(productId: string, quantity?: number, options?: AddToCartOptions): Promise<CartOperationResult>;
    removeLineItems(lineItemIds: string[]): Promise<CartOperationResult>;
    updateLineItemQuantity(lineItemId: string, quantity: number): Promise<CartOperationResult>;
    clearCart(): Promise<void>;
    applyCoupon(couponCode: string): Promise<CartOperationResult>;
    removeCoupon(): Promise<CartOperationResult>;
    checkout(): Promise<string>;    // Returns Wix checkout redirect URL
}
```

## Dependencies

- `@wix/ecom` — Cart operations (currentCart)
- `@wix/redirects` — Checkout redirect sessions
- `@jay-framework/wix-server-client` — Wix SDK client and authentication
