# @jay-framework/wix-stores-v1

Wix Stores **Catalog V1** API client and headless components for the Jay Framework.

## Overview

This package provides integration with the Wix Stores Catalog V1 API. If your Wix store uses the newer Catalog V3 API, use `@jay-framework/wix-stores` instead.

### V1 vs V3

| Feature | V1 (this package) | V3 (@jay-framework/wix-stores) |
|---------|------------------|-------------------------------|
| Products API | `products` | `productsV3` |
| Collections | `collections` | `@wix/categories` |
| Pagination | Skip-based | Cursor-based |
| Price format | Numbers (289) | Strings ("289") |

## Installation

```bash
npm install @jay-framework/wix-stores-v1
```

## Quick Start

### 1. Configure Wix

Set up your Wix configuration in `config/.wix.yaml`:

```yaml
apiKeyStrategy:
  apiKey: "your-api-key"
  siteId: "your-site-id"

oauthStrategy:
  clientId: "your-oauth-client-id"
```

### 2. Use Server Actions

```typescript
import { searchProducts, getProductBySlug, getCollections } from '@jay-framework/wix-stores-v1';

// Search products
const results = await searchProducts({
    query: 'whisky',
    filters: { inStockOnly: true },
    sortBy: 'price_asc',
    pageSize: 12,
    page: 1
});

// Get a product by slug
const product = await getProductBySlug({ slug: 'peat-s-beast-px-finish-54-1' });

// Get collections (V1 equivalent of categories)
const collections = await getCollections();
```

### 3. Use Client Context

```typescript
import { useContext } from '@jay-framework/runtime';
import { WIX_STORES_V1_CONTEXT } from '@jay-framework/wix-stores-v1';

function MyComponent(props, refs) {
    const stores = useContext(WIX_STORES_V1_CONTEXT);
    
    // Reactive cart indicator
    const itemCount = stores.cartIndicator.itemCount();
    
    // Add to cart
    refs.addToCart.onclick(async () => {
        await stores.addToCart('product-id', 1);
    });
}
```

## API

### Server Actions

| Action | Description |
|--------|-------------|
| `searchProducts(input)` | Search/filter products with pagination |
| `getProductBySlug(input)` | Get a single product by URL slug |
| `getCollections()` | Get available collections for filtering |

### Client Context Methods

| Method | Description |
|--------|-------------|
| `cartIndicator.itemCount()` | Reactive cart item count |
| `cartIndicator.hasItems()` | Reactive boolean for cart state |
| `addToCart(productId, qty, variantId?)` | Add product to cart |
| `removeLineItems(ids)` | Remove items from cart |
| `updateLineItemQuantity(id, qty)` | Update item quantity |
| `clearCart()` | Remove all items |
| `applyCoupon(code)` | Apply coupon code |
| `removeCoupon()` | Remove applied coupon |
| `getCollections()` | Get all collections |

## Differences from V3

### Price Handling

V1 prices are numbers, V3 are strings. This package handles the conversion:

```typescript
// V1 API response
{ price: { price: 289, formatted: { price: "€289.00" } } }

// Mapped to ViewState (same format as V3)
{ actualPriceRange: { minValue: { amount: "289", formattedAmount: "€289.00" } } }
```

### Collections vs Categories

V1 uses "collections" (`@wix/stores/collections`), V3 uses "categories" (`@wix/categories`):

```typescript
// V1 - this package
const collections = await getCollections();

// V3 - @jay-framework/wix-stores
const categories = await getCategories();
```

### Pagination

V1 uses skip-based pagination:

```typescript
// V1
const results = await searchProducts({ page: 2, pageSize: 12 });

// V3 uses cursor-based
const results = await searchProducts({ cursor: 'abc123', pageSize: 12 });
```

## Reference

- [Wix Stores Products V1 API](https://dev.wix.com/docs/sdk/backend-modules/stores/products/introduction)
- [Wix Stores Collections API](https://dev.wix.com/docs/sdk/backend-modules/stores/collections/introduction)
- Design Log: `wix/design-log/06 - wix-stores-v1 package.md`

## License

Apache-2.0
