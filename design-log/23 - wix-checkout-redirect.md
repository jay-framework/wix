# Design Log 23: Wix Checkout Redirect

## Status

Draft

## Background

The `@jay-framework/wix-cart` package provides a complete cart experience — add/remove items, quantity updates, coupon codes, and cart summary with estimated totals. But the checkout button is a stub:

```typescript
async function handleCheckout() {
  setIsCheckingOut(true);
  window.location.href = '/checkout';
}
```

This redirects to a non-existent `/checkout` route. We need to integrate with Wix's checkout flow.

### Wix Headless Checkout Flow

Wix headless sites use a redirect-based checkout. The flow (from [Wix Redirects API docs](https://dev.wix.com/docs/api-reference/business-management/headless/redirects/sample-flows)):

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Cart Page    │     │ Server       │     │ Wix Checkout │     │ Thank You    │
│ (Jay app)    │────→│ Create       │────→│ (hosted by   │────→│ Page         │
│              │     │ Redirect     │     │ Wix)         │     │ (Jay app)    │
│ Click        │     │ Session      │     │              │     │              │
│ "Checkout"   │     │              │     │ Payment,     │     │ Order        │
│              │     │ Returns URL  │     │ Shipping,    │     │ confirmation │
│              │     │              │     │ Review       │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

The key steps:

1. **Create a redirect session** — server-side call to `redirects.createRedirectSession()` with `{ ecomCheckout: { checkoutId } }` or `{ ecomCheckout: { currentCart: true } }`. Returns a `redirectSession.fullUrl`.

2. **Redirect the user** — client navigates to the Wix-hosted checkout URL.

3. **Wix handles checkout** — payment, shipping, order creation all happen on Wix's hosted checkout page.

4. **Return to the app** — after checkout, Wix redirects back to a configurable "thank you" URL on the Jay app.

### What We Have

- **Cart contract** already has `checkoutButton` (interactive) and `isCheckingOut` (variant)
- **Cart context** (`WixCartContext`) has all cart operations but no checkout
- **Cart service** (`WixCartService`) wraps `@wix/ecom` currentCart client
- **Wix SDK** includes `@wix/ecom` which has the redirects module

## Problem

We need to:

1. Create a checkout redirect session from the current cart
2. Redirect the user to Wix's hosted checkout
3. Handle the return (thank you page with order confirmation)
4. Configure the callback URLs

## Questions & Answers

Q1: Should we use Wix's hosted checkout or build a custom checkout page?
A: Wix's hosted checkout. Building custom checkout requires PCI compliance, payment processor integration, and order state management. The hosted checkout handles all of this and is the standard approach for Wix headless sites.

Q2: Where does the redirect session get created — client or server?
A: Server-side. The `createRedirectSession()` API requires API key authentication (not OAuth). The client calls a server action, which creates the session and returns the URL.

Q3: What SDK module provides the redirect?
A: `@wix/ecom` includes the `redirects` module with `createRedirectSession()`. We already depend on `@wix/ecom` in wix-cart.

Q4: What happens after checkout completes?
A: Wix redirects to a configurable URL. We need a "thank you" page route in the Jay app. The redirect includes an `orderId` query parameter.

Q5: Should this be in `wix-cart` or a new package?
A: In `wix-cart`. Checkout is the natural next step after cart — same contract, same context. No need for a separate package.

## Design

### Server Action: `createCheckoutRedirect`

A new server action in `wix-cart` that creates a Wix redirect session:

```typescript
// New action in wix-cart
export const createCheckoutRedirect = makeJayAction('wixCart.createCheckoutRedirect')
  .withServices(WIX_CART_SERVICE)
  .withHandler(async (input: { origin: string; cancelUrl: string }, cartService) => {
    const { redirects, urls } = cartService;
    const thankYouUrl = urls.thankYou || '/thank-you';

    const { redirectSession } = await redirects.createRedirectSession({
      ecomCheckout: { currentCart: true },
      callbacks: {
        postFlowUrl: input.origin + thankYouUrl,
      },
    });

    return { checkoutUrl: redirectSession.fullUrl };
  });
```

### Plugin Configuration

Add checkout URL to `config/.wix-cart.yaml` (created by setup if missing):

```yaml
# config/.wix-cart.yaml
urls:
  thankYou: '/thank-you' # default, configurable per site
```

The cart service reads this at init time and passes it to the checkout flow. Default is `/thank-you` if not configured.

### Cart Context Enhancement

Add checkout method to `WixCartContext`:

```typescript
interface WixCartContext {
  // ... existing methods ...

  /** Creates a checkout redirect session and returns the URL */
  checkout(): Promise<string>;
}
```

The client-side implementation calls the server action:

```typescript
async checkout() {
    const result = await callAction('wixCart.createCheckoutRedirect', {
        origin: window.location.origin,
        cancelUrl: window.location.href,
    });

    return result.checkoutUrl;
}
```

### Cart Component Update

Update `handleCheckout()` in `cart-page.ts`:

```typescript
async function handleCheckout() {
  setIsCheckingOut(true);
  try {
    const checkoutUrl = await cartContext.checkout();
    window.location.href = checkoutUrl;
  } catch (e) {
    console.error('Checkout redirect failed:', e);
    setIsCheckingOut(false);
    // Could set an error variant on the contract
  }
}
```

### Cart Contract Update

Add optional error state for checkout failures:

```yaml
# Add to cart-page.jay-contract
- {
    tag: checkoutError,
    type: variant,
    dataType: string,
    phase: fast+interactive,
    description: Error message if checkout redirect fails,
  }
```

### Cart Service Enhancement

Extend `WixCartService` to include the redirects client and config:

```typescript
export interface WixCartService {
  cart: ReturnType<typeof getCurrentCartClient>;
  redirects: ReturnType<typeof getRedirectsClient>;
  urls: { thankYou: string };
}
```

### Thank You Page

A simple page that receives `orderId` from the redirect query parameter:

```
src/pages/thank-you/page.jay-html
```

This could display an order confirmation. For MVP, a static "Thank you for your order" page is sufficient — order details can be added later via the Orders API.

### Callback URL Configuration

The redirect session needs absolute URLs. The client passes `window.location.origin` to the server action, which combines it with the configured `urls.thankYou` path (default `/thank-you`). This works in both:

- **Local dev**: `http://localhost:5173/thank-you`
- **BaaS production**: `https://my-site.wix-site-host.com/thank-you`

## Implementation Plan

### Phase 1: Checkout Redirect (MVP)

1. Add `redirects` client to `WixCartService`
2. Create `createCheckoutRedirect` server action
3. Add `checkout()` method to `WixCartContext`
4. Update `handleCheckout()` in cart-page component
5. Add `checkoutError` variant to cart-page contract

### Phase 2: Thank You Page

1. Create a basic thank-you page template in examples
2. Display order ID from query parameter
3. Clear cart indicator after successful checkout

### Phase 3: Order Details (Future)

1. Add order lookup action using Orders API
2. Display order summary on thank-you page
3. Add order history page (requires wix-members)

## Trade-offs

| Decision                               | Benefit                                           | Cost                                 |
| -------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| Wix hosted checkout                    | No PCI, no payment integration, works immediately | No UI customization of checkout flow |
| Server action for redirect             | Secure (API key auth), not exposed to client      | Extra round-trip before redirect     |
| Callback from `window.location.origin` | Works in dev + production automatically           | Relies on correct origin detection   |
| checkoutError as variant               | UI can show error state                           | Adds complexity to contract          |

## Implementation Results (2026-06-09)

### Phase 1: Checkout Redirect — DONE

**Two-step checkout flow:**
1. `cartClient.createCheckoutFromCurrentCart({})` → returns `checkoutId`
2. `redirectsClient.createRedirectSession({ ecomCheckout: { checkoutId }, callbacks: { postFlowUrl } })` → returns redirect URL

This was different from the original design which assumed `currentCart: true` could be passed directly to `createRedirectSession`. The Wix Redirects API requires an explicit `checkoutId`, so a checkout must be created first from the current cart.

**Files changed:**
- `lib/utils/redirects-client.ts` — new factory for `@wix/redirects` client
- `lib/config-loader.ts` — reads `config/.wix-cart.yaml` for `urls.thankYou` (default `/thank-you`)
- `lib/services/wix-cart-service-marker.ts` — `WixCartService` extended with `redirects` and `urls`
- `lib/services/wix-cart-service.ts` — provider creates redirects client, accepts URL config
- `lib/contexts/wix-cart-context.ts` — added `checkout()`: creates checkout from cart → creates redirect session → returns URL
- `lib/components/cart-page.ts` — `handleCheckout()` calls `cartContext.checkout()` and redirects
- `lib/init.ts` — reads cart config, passes `thankYouUrl` to client context
- `package.json` — added `@wix/redirects` dependency

**Deviations from design:**
- Checkout runs client-side (OAuth) not server-side (API key). The `createCheckoutFromCurrentCart` and `createRedirectSession` APIs work with OAuth, so no server action is needed. Simpler — no extra round-trip.
- No `checkoutError` variant added to the contract yet. Errors are logged to console and `isCheckingOut` is reset to false.
- No thank-you page template in examples yet (Phase 2).
