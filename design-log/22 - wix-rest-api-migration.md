# Design Log 22: Wix REST API Migration

## Status

Draft

## Background

The Jay Framework Wix packages (`wix-stores`, `wix-cart`, `wix-server-client`) use the Wix SDK's module system (`client.use(productsV3)`) to call Wix APIs. This pulls in `@wix/stores`, `@wix/ecom`, `@wix/categories`, `@wix/data-extension-schema` — totaling 53 MB in node_modules. BaaS has a 20 MB deployment limit, making the current approach unworkable.

The Wix SDK does two things:
1. **Auth management** — `ApiKeyStrategy`, `OAuthStrategy`, token lifecycle, OAuth flows (login, register, token refresh, PKCE). This is complex and valuable.
2. **API modules** — `productsV3`, `currentCart`, `categories` — typed wrappers around REST endpoints. These add bulk but are functionally just `fetch()` calls with auth headers.

## Problem

Replace the SDK API modules with direct REST calls while keeping the SDK for auth. This eliminates 53 MB of `@wix/*` module dependencies, making BaaS deployment viable (~3.5 MB instead of 55+ MB).

## Design

### Keep `@wix/sdk` for Auth

The SDK's auth system stays unchanged:

```typescript
// Server — API key auth
const client = createClient({
    auth: ApiKeyStrategy({ apiKey, siteId }),
    modules: {},  // no modules needed
});

// Client — OAuth auth
const client = createClient({
    auth: OAuthStrategy({ clientId, tokens }),
    modules: {},
});
```

The `client.auth` provides:
- `getAuthHeaders()` → `{ headers: { Authorization: '...' } }`
- `generateVisitorTokens()`, `renewToken()`, `setTokens()`, `getTokens()`
- `login()`, `register()`, `processVerification()`, `loggedIn()`, `logout()`
- `getMemberTokensForDirectLogin()`, `sendPasswordResetEmail()`

All of this stays as-is.

### REST API Wrapper Pattern

Create a typed REST client that uses the SDK's auth headers:

```typescript
import type { WixClient } from '@wix/sdk';

const WIX_API_BASE = 'https://www.wixapis.com';

async function wixFetch<T>(
    client: WixClient,
    method: string,
    path: string,
    body?: any,
): Promise<T> {
    const { headers } = await client.auth.getAuthHeaders();
    const response = await fetch(`${WIX_API_BASE}${path}`, {
        method,
        headers: {
            ...headers,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
        throw new Error(`Wix API ${response.status}: ${path}`);
    }
    return response.json();
}
```

### Where REST Functions Live

**Option A: In a shared `wix-rest` utility module**

```
packages/wix-utils/lib/
├── media.ts          # existing media utilities
└── rest/
    ├── client.ts     # wixFetch helper
    ├── stores.ts     # queryProducts, getProductBySlug, ...
    ├── cart.ts        # getCurrentCart, addToCart, ...
    └── categories.ts  # queryCategories
```

Pros: Centralized, reusable, one place to maintain REST endpoints.
Cons: Another package dependency, all API functions in one place.

**Option B: In each package's service/context**

```
packages/wix-stores/lib/
├── services/
│   └── wix-stores-service.ts    # uses wixFetch for server calls
├── contexts/
│   └── wix-stores-context.ts    # uses wixFetch for client calls
└── rest/
    └── stores-api.ts            # queryProducts, getProductBySlug, ...

packages/wix-cart/lib/
├── services/
│   └── wix-cart-service.ts
├── contexts/
│   └── wix-cart-context.ts
└── rest/
    └── cart-api.ts              # getCurrentCart, addToCart, ...
```

Pros: Each package is self-contained, REST functions co-located with usage.
Cons: `wixFetch` helper duplicated or shared via wix-utils.

**Option C: REST functions in the service/context directly (no separate layer)**

The REST calls are inlined where they're currently used — inside the service (server) and context (client):

```typescript
// In wix-stores-service.ts (server)
export function provideWixStoresService(wixClient: WixClient) {
    async function queryProducts(query) {
        const { headers } = await wixClient.auth.getAuthHeaders();
        const res = await fetch('https://www.wixapis.com/stores/v3/products/query', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });
        return res.json();
    }
    // ...
}
```

Pros: Simplest, no abstraction, easy to understand.
Cons: Auth header logic repeated in every call, harder to maintain endpoints.

## Questions & Answers

Q1: Which option for the REST function organization?
A: Per package, each file one API call. Folder named `wix-apis/` (not `rest/` — we're implementing API clients, not exposing REST APIs).

```
packages/wix-stores/lib/
├── wix-apis/
│   ├── query-products.ts
│   ├── get-product.ts
│   ├── query-categories.ts
│   ├── query-inventory.ts
│   ├── list-customizations.ts
│   └── types.ts           # copied/adjusted types from SDK
├── services/
├── contexts/
└── components/
```

Q2: Should the `wixFetch` helper be in `wix-utils` or `wix-server-client`?
A: In `wix-server-client` — it owns the Wix client and auth. The helper uses `client.auth.getAuthHeaders()` which comes from the SDK client that `wix-server-client` manages.

Q3: The current code uses typed response objects from `@wix/auto_sdk_stores_products-v-3` etc. for type safety. Without those, do we define our own types or use `any`?
A: Copy and adjust the types from the SDK. Place them in the `wix-apis/` directory alongside the API functions.

Q4: The client-side `wix-cart-context.ts` uses `wixClient.use(currentCart)` methods directly. Should the REST wrapper use the same auth mechanism (`client.auth.getAuthHeaders()`) on both client and server?
A: Yes. The `wixFetch` helper should work with any `WixClient` — server (ApiKeyStrategy) or client (OAuthStrategy). Both provide `getAuthHeaders()`.

Q5: Some API calls use query builder patterns (`client.use(categories).queryCategories().eq('visible', true).limit(100).find()`). The REST equivalent is a JSON query body. Is the translation straightforward?
A: Drop query builders. Use plain JSON query bodies directly.

## API Inventory

### Stores (wix-stores package)

| Current SDK call | REST endpoint | Method | Used in |
|-----------------|---------------|--------|---------|
| `productsV3.queryProducts(query)` | `/stores/v3/products/query` | POST | `stores-actions.ts` (searchProducts, getProductBySlug) |
| `productsV3.getProduct(id)` | `/stores/v3/products/{id}` | GET | `stores-actions.ts` (related products) |
| `categories.queryCategories()` | `/stores/v1/categories/query` | POST | `stores-actions.ts` (getCategories) |
| `inventoryItemsV3.queryInventory()` | `/stores/v3/inventoryItems/query` | POST | `stores-actions.ts` (getVariantStock) |
| `customizationsV3.listCustomizations()` | `/stores/v3/customizations` | GET | `product-page.ts` (modifiers) |
| `dataExtensionSchemas.querySchemas()` | `/data-extension-schema/v1/schemas/query` | POST | `wix-stores-service.ts` (setup) |

### Cart (wix-cart package)

| Current SDK call | REST endpoint | Method | Used in |
|-----------------|---------------|--------|---------|
| `currentCart.getCurrentCart()` | `/ecom/v1/carts/current` | GET | `wix-cart-context.ts` |
| `currentCart.addToCurrentCart(items)` | `/ecom/v1/carts/current/add` | POST | `wix-cart-context.ts` |
| `currentCart.removeLineItemsFromCurrentCart(ids)` | `/ecom/v1/carts/current/removeLineItems` | POST | `wix-cart-context.ts` |
| `currentCart.updateCurrentCartLineItemQuantity(items)` | `/ecom/v1/carts/current/updateLineItemQuantity` | POST | `wix-cart-context.ts` |
| `currentCart.updateCurrentCart(cart)` | `/ecom/v1/carts/current` | PATCH | `wix-cart-context.ts` (coupon) |
| `currentCart.removeCouponFromCurrentCart()` | `/ecom/v1/carts/current/removeCoupon` | POST | `wix-cart-context.ts` |
| `currentCart.estimateCurrentCartTotals()` | `/ecom/v1/carts/current/estimateTotals` | POST | `wix-cart-context.ts` |

### Server Client (wix-server-client package)

| Current SDK call | REST equivalent | Notes |
|-----------------|----------------|-------|
| `createClient({ auth: ApiKeyStrategy(...) })` | Keep as-is | Auth only, no modules |
| `createClient({ auth: OAuthStrategy(...) })` | Keep as-is | Auth only, no modules |
| `client.auth.*` methods | Keep as-is | OAuth flows stay in SDK |

## Impact

### What's removed
- `@wix/stores` (includes `@wix/auto_sdk_stores_products-v-3`, `@wix/auto_sdk_stores_inventory-items-v-3`, `@wix/auto_sdk_stores_customizations-v-3`)
- `@wix/ecom` (includes `@wix/auto_sdk_ecom_current-cart`, `@wix/auto_sdk_ecom_cart-v-2`, `@wix/auto_sdk_ecom_checkout`, `@wix/auto_sdk_ecom_orders`, `@wix/auto_sdk_ecom_draft-orders`, ...)
- `@wix/categories` (includes `@wix/auto_sdk_categories_categories`)
- `@wix/data-extension-schema`
- All their transitive dependencies

### What's kept
- `@wix/sdk` — auth strategies, token management, OAuth flows
- `@wix/sdk-types` — shared types (if needed)

### Size impact
- **Before**: 53 MB `@wix/*` in node_modules
- **After**: ~200 KB (`@wix/sdk` only, already bundled in entry.mjs)
- **BaaS dist**: drops from 55+ MB to ~3.5 MB

### Risk
- REST endpoint URLs could change (unlikely for v3 APIs)
- Response shapes might differ slightly from SDK types (need to verify)
- Query builder patterns need manual JSON translation

## Implementation Plan

### Phase 0: Exploration — validate REST approach
- Create `exploration/wix-rest-api/`
- Use `@wix/sdk` with `ApiKeyStrategy` for server auth, `OAuthStrategy` for client auth
- Call `client.auth.getAuthHeaders()` and use with `fetch()` directly
- Test 1: `POST /stores/v3/products/query` — query products, verify response shape matches SDK
- Test 2: `GET /ecom/v1/carts/current` — get current cart via OAuth, verify client auth works
- Validate: response types, error handling, auth headers, both environments

### Phase 1: wixFetch helper in wix-server-client
- Add `wixFetch<T>(client, method, path, body?)` to `wix-server-client`
- Uses `client.auth.getAuthHeaders()` — works with both ApiKey and OAuth
- Export from the package for use by other packages

### Phase 2: Stores API functions
- Create `wix-stores/lib/wix-apis/` with one file per API call
- Copy and adjust response types from SDK modules
- Replace usage in services, components, and actions
- Remove `@wix/stores`, `@wix/categories`, `@wix/data-extension-schema` from dependencies
- Remove from vite.config.ts externals

### Phase 3: Cart API functions
- Create `wix-cart/lib/wix-apis/` with one file per API call
- Copy and adjust response types from SDK modules
- Replace usage in service and context (both server and client)
- Remove `@wix/ecom` from dependencies
- Remove from vite.config.ts externals

### Phase 4: Verify locally
- Rebuild all packages
- Run store-light example with `jay-stack dev`
- Verify: product pages render, search works, cart add/remove/checkout works

### Phase 5: BaaS deployment
- Rebuild for BaaS: `build:production` → `deploy:build-entry` → `deploy:deploy`
- dist/node_modules should now be ~1 MB (only `@jay-framework/*`)
- Verify deployed site works end-to-end

## Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Keep @wix/sdk for auth | OAuth complexity handled, tested, maintained by Wix | Still a dependency (~200 KB bundled) |
| Direct REST calls | 53 MB → 0 MB for API modules, BaaS-deployable | Must maintain endpoint URLs, lose query builder |
| Types from response | Lightweight, no extra deps | Less type safety than SDK-generated types |
| wixFetch in wix-utils | Shared across packages, single auth pattern | One more module in wix-utils |
