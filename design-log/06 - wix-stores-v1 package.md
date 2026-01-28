# Design Log 06: Wix Stores V1 (Catalog V1) Package

## Status
Implemented

## Background

The existing `@jay-framework/wix-stores` package is built on **Wix Catalog V3 API** (`productsV3` from `@wix/stores`). Some Wix stores are still using the older **Catalog V1 API** and need a compatible package.

### Reference
- V1 exploration project: `wix/exploration/query-products-catalog-v1/`
- V1 product examples: `wix/exploration/query-products-catalog-v1/output/individual/*.json`
- V3 exploration project: `wix/exploration/query-products-catalog-v3/`

### V1 vs V3 API Differences

| Feature | Catalog V1 | Catalog V3 |
|---------|-----------|------------|
| Module import | `products` | `productsV3` |
| Price structure | `price.price`, `price.discountedPrice` | `actualPriceRange.minValue.amount` |
| Price format | Number (e.g., `289`) | String (e.g., `"120"`) |
| Formatted price | `price.formatted.price` | Not in response (must format) |
| Inventory | `stock.inStock`, `stock.quantity` | `inventory.availabilityStatus` |
| Media URL | Full URL in `media.mainMedia.image.url` | Wix image URI `wix:image://v1/...` |
| Pagination | `skip(n).limit(m)` | Cursor-based `hasNext()` |
| Collections | `collectionIds[]` | `mainCategoryId` |
| Variants | `variants[]` with `variant.priceData` | `variantsInfo.variants[]` |
| Product options | `productOptions[]` | `options[]` with `choicesSettings` |

## Problem

Users with Wix stores using Catalog V1 API cannot use the existing `wix-stores` package. We need a new package that:
1. Works with the V1 API data structures
2. Shares contracts and components where possible with V3
3. Provides the same developer experience

## Questions & Answers

**Q1: Should we create separate contracts for V1 or reuse V3 contracts?**
A: Try to reuse the same contracts - they define *view state*, not API response. The product mapper converts V1 responses to ViewState. If V1 data doesn't fit the contracts well, create similar but V1-specific contracts. **Verify during implementation.**

**Q2: Should we create a new package or add V1 support to existing package?**
A: Create a new package `@jay-framework/wix-stores-v1`. This keeps the packages clean and avoids confusion about which API version is being used.

**Q3: What about cart and checkout - do they differ between V1 and V3?**
A: Cart/Checkout uses `@wix/ecom` which is the same for both. Only product catalog APIs differ. **Future consideration:** Extract cart/checkout to a separate shared package (e.g., `@jay-framework/wix-cart`) that both V1 and V3 packages can depend on.

**Q4: Should collections/categories work differently?**
A: V1 uses `@wix/stores` `collections` module. V3 uses `@wix/categories`. The V1 package should use `collections`.

## Design

### Package Structure

```
wix-stores-v1/
├── lib/
│   ├── index.ts                  # Server exports
│   ├── index.client.ts           # Client exports  
│   ├── init.ts                   # Plugin initialization
│   ├── services/
│   │   └── wix-stores-v1-service.ts   # Server service
│   ├── utils/
│   │   ├── wix-store-v1-api.ts        # V1 API client wrappers
│   │   └── product-mapper-v1.ts       # V1 → ViewState mapping
│   ├── actions/
│   │   └── stores-v1-actions.ts       # Server actions
│   └── components/
│       └── ... (reuse or adapt from V3)
├── package.json
├── plugin.yaml
├── tsconfig.json
├── vite.config.ts
└── README.md
```

### Key Changes from V3 Package

#### 1. API Client (`wix-store-v1-api.ts`)

```typescript
import { products, collections, inventory } from "@wix/stores";
import { currentCart } from "@wix/ecom";

// V1 uses 'products' instead of 'productsV3'
export function getProductsClient(wixClient: WixClient): typeof products {
    return wixClient.use(products);
}

// V1 uses 'collections' instead of '@wix/categories'
export function getCollectionsClient(wixClient: WixClient): typeof collections {
    return wixClient.use(collections);
}
```

#### 2. Product Mapper (`product-mapper-v1.ts`)

Maps V1 API response to the same ViewState as V3:

```typescript
// V1 product structure
interface V1Product {
    _id: string;
    name: string;
    slug: string;
    price: {
        currency: string;
        price: number;  // Number, not string!
        discountedPrice: number;
        formatted: {
            price: string;  // "€289.00"
            discountedPrice: string;
        };
    };
    stock: {
        inStock: boolean;
        quantity: number;
        inventoryStatus: string;  // "IN_STOCK" | "OUT_OF_STOCK"
    };
    media: {
        mainMedia: {
            image: { url: string; width: number; height: number; };
            thumbnail: { url: string; width: number; height: number; };
        };
    };
    // ...
}

export function mapProductToCard(product: V1Product): ProductCardViewState {
    const hasDiscount = product.price.discountedPrice < product.price.price;
    
    return {
        _id: product._id,
        name: product.name,
        slug: product.slug,
        productUrl: `/products/${product.slug}`,
        mainMedia: {
            url: product.media?.mainMedia?.image?.url || '',
            altText: product.name,
            mediaType: MediaType.IMAGE
        },
        thumbnail: {
            url: product.media?.mainMedia?.thumbnail?.url || '',
            altText: product.name,
            width: product.media?.mainMedia?.thumbnail?.width || 300,
            height: product.media?.mainMedia?.thumbnail?.height || 300
        },
        // V1 prices are numbers, convert to string amount format
        actualPriceRange: {
            minValue: {
                amount: String(product.price.discountedPrice),
                formattedAmount: product.price.formatted.discountedPrice
            },
            maxValue: {
                amount: String(product.price.discountedPrice),
                formattedAmount: product.price.formatted.discountedPrice
            }
        },
        compareAtPriceRange: {
            minValue: {
                amount: String(product.price.price),
                formattedAmount: hasDiscount ? product.price.formatted.price : ''
            },
            maxValue: {
                amount: String(product.price.price),
                formattedAmount: hasDiscount ? product.price.formatted.price : ''
            }
        },
        currency: product.price.currency,
        hasDiscount,
        inventory: {
            availabilityStatus: mapInventoryStatus(product.stock.inventoryStatus),
            preorderStatus: PreorderStatus.DISABLED  // V1 doesn't have preorder in same format
        },
        // ...rest of mapping
    };
}
```

#### 3. Service Registration

```typescript
export const WIX_STORES_V1_SERVICE_MARKER = createJayService<WixStoresV1Service>('Wix Store V1 Service');
```

### Shared Components Strategy

**Decision: Option A - Copy components and adapt**
- Pro: Full flexibility, no cross-package dependencies
- Con: Code duplication
- Rationale: Product mapper handles API differences, components should work with minimal changes

## Implementation Plan

### Phase 1: Core Package Setup
1. Create package directory structure
2. Set up `package.json` with V1-specific dependencies
3. Create `tsconfig.json` and `vite.config.ts`
4. Create `plugin.yaml`

### Phase 2: API Clients
1. Create `wix-store-v1-api.ts` with V1 client wrappers
2. Create `wix-stores-v1-service.ts` service

### Phase 3: Product Mapper
1. Create `product-mapper-v1.ts` 
2. Map V1 structure to existing ViewState contracts
3. Copy contracts from V3 package (they're API-agnostic)

### Phase 4: Server Actions
1. Create `stores-v1-actions.ts`
2. Adapt `searchProducts`, `getProductBySlug`, etc. for V1 API

### Phase 5: Components
1. Copy and adapt product components
2. Update to use V1 service marker
3. Test with V1 API responses

### Phase 6: Client Context
1. Adapt client-side context if needed
2. Cart operations should work unchanged (uses @wix/ecom)

## Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Separate package | Clean separation, no API version confusion | Some code duplication |
| Reuse contracts | Consistent ViewState, shared templates work | Must carefully map V1→ViewState |
| Copy components | Flexibility for V1-specific behavior | Maintenance of two codebases |

## Verification Criteria

1. ✅ Can query products using Catalog V1 API
2. ✅ ProductCardViewState matches between V1 and V3 packages
3. ✅ Same jay-html templates work with both packages
4. ✅ Cart operations work (shared @wix/ecom)
5. ✅ All existing V3 tests pass after refactoring

## Dependencies

```json
{
  "dependencies": {
    "@jay-framework/component": "^0.11.0",
    "@jay-framework/fullstack-component": "^0.11.0",
    "@jay-framework/wix-server-client": "^1.0.0",
    "@jay-framework/wix-utils": "^1.0.0",
    "@wix/stores": "^1.0.563",   // Same package, different module
    "@wix/ecom": "^1.0.753",
    "@wix/sdk": "^1.17.4"
  }
}
```

Note: `@wix/categories` is NOT needed for V1 - it uses `collections` from `@wix/stores`.

---

## Implementation Results

### Completed: 2026-01-28

Package created at `wix/packages/wix-stores-v1/` with:

**Files Created:**
- `lib/utils/wix-store-v1-api.ts` - V1 API client wrappers (`products`, `collections`, `inventory`)
- `lib/services/wix-stores-v1-service.ts` - Server service with `WIX_STORES_V1_SERVICE_MARKER`
- `lib/utils/product-mapper-v1.ts` - V1 → ViewState mapping with `V1Product` type
- `lib/actions/stores-v1-actions.ts` - Server actions (`searchProducts`, `getProductBySlug`, `getCollections`)
- `lib/contexts/wix-stores-v1-context.ts` - Client context with cart operations
- `lib/contexts/cart-helpers.ts` - Copied from V3 (shared @wix/ecom)
- `lib/contracts/*` - Copied all contracts from V3 (reused successfully)
- `lib/init.ts`, `lib/index.ts`, `lib/index.client.ts` - Entry points

**Deviations from Design:**
1. **No getProductBySlug API** - V1 doesn't have `getProductBySlug()`, implemented via `queryProducts().eq('slug', slug)`
2. **Sort field names** - V1 uses `priceData.price` and `lastUpdated` instead of `price.price` and `_createdDate`
3. **Type cleanup** - Removed custom type casts, now uses native Wix SDK types (`Product` from `@wix/auto_sdk_stores_products`, `Collection` from `@wix/auto_sdk_stores_collections`)

### Components Added: 2026-01-28

**Component Files Created:**
- `lib/components/cart-indicator.ts` - Cart indicator for headers, uses V1 service/context
- `lib/components/cart-page.ts` - Full cart page with line item management
- `lib/components/product-page.ts` - Product detail page with options/variants
- `lib/components/product-search.ts` - Search with filtering, sorting, page-based pagination
- `lib/components/collection-list.ts` - List of store collections (V1 uses collections, not categories)
- `lib/components/collection-page.ts` - Collection detail page with products

**Key V1 Component Differences:**
- Uses `WIX_STORES_V1_SERVICE_MARKER` and `WIX_STORES_V1_CONTEXT`
- Product page maps V1 `productOptions` instead of V3 `options.choicesSettings`
- Product search uses page-based pagination (`page: 1, 2, 3...`) instead of cursor-based
- Collection list queries `collections` module instead of `categories`
- V1 variant matching uses `variant.choices` (Record<optionName, choiceValue>)

**Build Output:**
- `dist/index.js` - Server bundle (26.28 KB)
- `dist/index.client.js` - Client bundle (21.42 KB)
- `dist/index.d.ts` - Type definitions (40.57 KB)
- `dist/contracts/*.jay-contract*` - Contract files and definitions

**Verification:**
- ✅ Build succeeds with `yarn build`
- ✅ Contracts reused from V3 without changes
- ✅ Cart operations use shared @wix/ecom code
- ✅ All 6 components created and exported
- ✅ Whisky-store example migrated and working with V1 package

---

## Future Consideration: Shared Cart/Ecom Package

### Problem

Cart and checkout code is duplicated between `wix-stores` (V3) and `wix-stores-v1`:

| File | V3 Lines | V1 Lines | Difference |
|------|----------|----------|------------|
| `cart-helpers.ts` | 404 | 404 | Identical |
| `cart-indicator.ts` | 121 | 121 | ~39 lines (service marker) |
| `cart-page.ts` | 391 | 391 | ~108 lines (service marker/context) |
| `wix-stores-context.ts` | 435 | 435 | ~50% cart operations identical |

**Total duplicated cart code: ~1,350 lines**

### Why This Works

Cart/checkout uses `@wix/ecom` which is **identical for V1 and V3**:
- `currentCart` module for cart operations
- `checkout` module for checkout flow
- Same API responses and data structures

### Proposal: `@jay-framework/wix-cart` Package

```
wix-cart/
├── lib/
│   ├── index.ts              # Server exports
│   ├── index.client.ts       # Client exports
│   ├── init.ts               # Optional: standalone cart init
│   ├── components/
│   │   ├── cart-indicator.ts # Shared cart indicator component
│   │   └── cart-page.ts      # Shared cart page component
│   ├── contexts/
│   │   ├── cart-context.ts   # Shared cart context (reactive state)
│   │   └── cart-helpers.ts   # Cart data mapping utilities
│   ├── services/
│   │   └── cart-service.ts   # Server-side cart service
│   └── contracts/
│       ├── cart-indicator.jay-contract
│       └── cart-page.jay-contract
├── plugin.yaml
└── package.json
```

### Integration Options

**Option A: Direct dependency**
```typescript
// wix-stores-v1/lib/index.ts
export { cartIndicator, cartPage } from '@jay-framework/wix-cart';
export { WIX_CART_CONTEXT } from '@jay-framework/wix-cart';
```

**Option B: Composition (inject service)**
```typescript
// wix-stores-v1/lib/init.ts
import { provideCartService } from '@jay-framework/wix-cart';

export const init = makeJayInit()
  .withServer(async () => {
    const wixClient = getService(WIX_CLIENT_SERVICE);
    provideWixStoresV1Service(wixClient);
    provideCartService(wixClient);  // Shared cart
  });
```

### Trade-offs

| Approach | Benefit | Cost |
|----------|---------|------|
| Extract cart package | Single source of truth, reduced maintenance | Additional package, more complex dependency graph |
| Keep duplicated | Simpler structure, packages are self-contained | ~1,350 lines duplicated, bug fixes needed in both |

### Questions to Resolve

1. **Should cart have its own init or piggyback on stores init?**
2. **How to handle service marker naming?** (WIX_CART_SERVICE vs WIX_STORES_SERVICE.cart)
3. **Should cart-context use WIX_CLIENT_CONTEXT directly or get injected?**

### Decision

**Deferred** - Current duplication is manageable. Consider extraction when:
- Adding a third stores package (e.g., V2 or different region)
- Significant cart feature additions
- Bug fixes repeatedly needed in both packages
