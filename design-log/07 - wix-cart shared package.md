# Design Log 07: Wix Cart Shared Package

## Status
Implemented

## Background

Cart and checkout code is duplicated between `wix-stores` (V3) and `wix-stores-v1`. Both use identical `@wix/ecom` APIs. Extracting cart functionality to a shared package reduces maintenance burden and ensures consistency.

See Design Log 06 for duplication analysis (~1,350 lines duplicated).

## Problem

Maintain two copies of cart code that:
1. Use the same `@wix/ecom` API
2. Have the same ViewState contracts
3. Differ only in service/context naming

## Questions & Answers

**Q1: Should cart have its own init or piggyback on stores init?**
A: Cart should have its own init. Other packages consume it via service and context injection.

**Q2: How to handle service marker naming?**
A: `WIX_CART_SERVICE`

**Q3: Should cart-context use WIX_CLIENT_CONTEXT directly or get injected?**
A: It should get `WIX_CLIENT_CONTEXT` injected.

## Design

### Package Structure

```
wix-cart/
├── lib/
│   ├── index.ts                 # Server exports
│   ├── index.client.ts          # Client exports
│   ├── init.ts                  # Plugin initialization
│   ├── components/
│   │   ├── cart-indicator.ts    # Shared cart indicator
│   │   └── cart-page.ts         # Shared cart page
│   ├── contexts/
│   │   ├── wix-cart-context.ts  # Reactive cart state
│   │   └── cart-helpers.ts      # Cart data mapping
│   ├── services/
│   │   └── wix-cart-service.ts  # Server-side cart service
│   └── contracts/
│       ├── cart-indicator.jay-contract
│       └── cart-page.jay-contract
├── plugin.yaml
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Service & Context

```typescript
// wix-cart-service.ts
export interface WixCartService {
    cart: ReturnType<typeof getCurrentCartClient>;
}

export const WIX_CART_SERVICE = createJayService<WixCartService>('Wix Cart Service');

export function provideWixCartService(wixClient: WixClient): WixCartService {
    const service: WixCartService = {
        cart: getCurrentCartClient(wixClient),
    };
    registerService(WIX_CART_SERVICE, service);
    return service;
}
```

```typescript
// wix-cart-context.ts
export const WIX_CART_CONTEXT = createJayContext<WixCartContext>('Wix Cart Context');

// Context receives WIX_CLIENT_CONTEXT during init
export function provideWixCartContext(): WixCartContext {
    const wixClientContext = getContext(WIX_CLIENT_CONTEXT);
    // ... cart operations using wixClientContext
}
```

### Init Pattern

```typescript
// wix-cart/lib/init.ts
export const init = makeJayInit()
    .withServer(async (): Promise<WixCartInitData> => {
        const wixClient = getService(WIX_CLIENT_SERVICE);
        provideWixCartService(wixClient);
        return { enableClientCart: true };
    })
    .withClient(async (data: WixCartInitData) => {
        const cartContext = provideWixCartContext();
        if (data.enableClientCart) {
            await cartContext.refreshCartIndicator();
        }
    });
```

### Consumer Integration

```typescript
// wix-stores-v1/lib/init.ts (after refactor)
import { init as cartInit } from '@jay-framework/wix-cart';

export const init = makeJayInit()
    .withServer(async (): Promise<WixStoresV1InitData> => {
        const wixClient = getService(WIX_CLIENT_SERVICE);
        provideWixStoresV1Service(wixClient);
        // Cart init is automatic via plugin discovery
        return { enableClientCart: true, enableClientSearch: true };
    })
    .withClient(async (data: WixStoresV1InitData) => {
        // Cart context already initialized by wix-cart plugin
        // Just register stores-specific context
        provideWixStoresV1Context();
    });
```

### Component Usage

Components use `WIX_CART_SERVICE` and `WIX_CART_CONTEXT`:

```typescript
// wix-cart/lib/components/cart-indicator.ts
export const cartIndicator = makeJayStackComponent()
    .withServices(WIX_CART_SERVICE)
    .withContract(CartIndicatorContract)
    // ...
```

## Implementation Plan

### Phase 1: Create wix-cart Package
1. Create package directory structure
2. Create `package.json`, `tsconfig.json`, `vite.config.ts`
3. Create `plugin.yaml`
4. Copy contracts from wix-stores

### Phase 2: Core Services
1. Create `wix-cart-service.ts` with `WIX_CART_SERVICE`
2. Create `wix-cart-context.ts` with `WIX_CART_CONTEXT`
3. Copy `cart-helpers.ts`
4. Create `init.ts`

### Phase 3: Components
1. Adapt `cart-indicator.ts` to use `WIX_CART_SERVICE`
2. Adapt `cart-page.ts` to use `WIX_CART_SERVICE`
3. Create entry points (`index.ts`, `index.client.ts`)

### Phase 4: Build & Test
1. Build wix-cart package
2. Verify exports and types

### Phase 5: Refactor wix-stores (V3)
1. Add `@jay-framework/wix-cart` dependency
2. Remove cart-related files (components, context, helpers)
3. Re-export cart components from wix-cart
4. Update init.ts to not register cart (wix-cart does it)
5. Update wix-stores-context.ts to use WIX_CART_CONTEXT

### Phase 6: Refactor wix-stores-v1
1. Add `@jay-framework/wix-cart` dependency
2. Remove cart-related files
3. Re-export cart components from wix-cart
4. Update init.ts
5. Update context

### Phase 7: Update Examples
1. Update store example - add wix-cart dependency if needed
2. Update whisky-store example - add wix-cart dependency if needed
3. Verify both examples work

## Verification Criteria

1. ✅ wix-cart package builds successfully
2. ✅ wix-stores builds with wix-cart dependency
3. ✅ wix-stores-v1 builds with wix-cart dependency
4. ✅ store example works unchanged
5. ✅ whisky-store example works unchanged
6. ✅ Cart operations work (add, update, remove, checkout)

## Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Separate package | Single source of truth | Additional dependency |
| Own init | Clean separation, works standalone | More init calls |
| Injected WIX_CLIENT_CONTEXT | Flexible, testable | Slightly more complex setup |

---

## Implementation Results

### Completed: 2026-01-28

**Package Created:** `@jay-framework/wix-cart` at `wix/packages/wix-cart/`

**Files Created:**
- `lib/services/wix-cart-service.ts` - Server service with `WIX_CART_SERVICE`
- `lib/contexts/wix-cart-context.ts` - Client context with `WIX_CART_CONTEXT`
- `lib/contexts/cart-helpers.ts` - Cart data mapping utilities
- `lib/components/cart-indicator.ts` - Cart indicator component
- `lib/components/cart-page.ts` - Full cart page component
- `lib/init.ts` - Plugin initialization
- `lib/index.ts`, `lib/index.client.ts` - Entry points
- `lib/contracts/cart-indicator.jay-contract`, `lib/contracts/cart-page.jay-contract` - Contracts

**Build Output:**
- `dist/index.js` - Server bundle (14.55 KB)
- `dist/index.client.js` - Client bundle (7.54 KB)
- `dist/index.d.ts` - Type definitions (16.06 KB)

**Packages Refactored:**
1. **wix-stores (V3)**:
   - Added `@jay-framework/wix-cart` dependency
   - Deleted `cart-indicator.ts`, `cart-page.ts`, `cart-helpers.ts`
   - Updated `index.ts`/`index.client.ts` to re-export from wix-cart
   - Updated `wix-stores-context.ts` to delegate cart operations to `WIX_CART_CONTEXT`
   - Updated `wix-stores-service.ts` to use cart from wix-cart (marked `cart` as deprecated)

2. **wix-stores-v1**:
   - Added `@jay-framework/wix-cart` dependency
   - Deleted `cart-indicator.ts`, `cart-page.ts`, `cart-helpers.ts`
   - Updated `index.ts`/`index.client.ts` to re-export from wix-cart
   - Updated `wix-stores-v1-context.ts` to delegate cart operations to `WIX_CART_CONTEXT`
   - Updated `wix-stores-v1-service.ts` to use cart from wix-cart

**Examples Updated:**
- `store` - Added `@jay-framework/wix-cart: "workspace:^"` dependency
- `whisky-store` - Added `@jay-framework/wix-cart: "workspace:^"` dependency

**Verification:**
- ✅ `wix-cart` package builds successfully
- ✅ `wix-stores` (V3) builds with wix-cart dependency
- ✅ `wix-stores-v1` builds with wix-cart dependency
- ✅ `store` example validation passes
- ✅ `whisky-store` example validation passes

**Code Reduction:**
- Removed ~1,350 lines of duplicated cart code from wix-stores and wix-stores-v1
- Single source of truth for cart functionality in wix-cart package
