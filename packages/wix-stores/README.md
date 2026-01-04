# @jay-framework/wix-stores

Wix Stores API client and headless full-stack components for the Jay Framework with server-side rendering support.

## Installation

```bash
npm install @jay-framework/wix-stores
```

## Features

- **Type-safe Wix Stores API client** - Pre-configured singleton clients for Products V3, Collections, and Inventory
- **Full-stack headless components** - Jay Stack components with SSR, SSG, and client-side interactivity built on Products V3 API
- **Three-phase rendering** - Slow (semi-static), Fast (dynamic), and Interactive (client-side) rendering phases
- **Server context** - Dependency injection for Wix API clients in server-side rendering
- **TypeScript support** - Full type definitions for all APIs and components

## Quick Start

### 1. Configure Wix

Set up your Wix configuration in a `.wix-config.json` file:

```json
{
  "apiKey": "your-api-key",
  "siteId": "your-site-id"
}
```

### 2. Set Up Server Context

In your application setup, provide the Wix Stores context:

```typescript
import { provideContext } from '@jay-framework/runtime';
import { 
  WixStoresContextMarker, 
  createWixStoresContext 
} from '@jay-framework/wix-stores';

// Provide the context at application startup
provideContext(WixStoresContextMarker, createWixStoresContext());
```

### 3. Use Headless Components

```typescript
import { productPage, categoryPage, productCard, productSearch } from '@jay-framework/wix-stores';

// Components are ready to use with automatic server-side rendering
```

## Headless Components

### Product Page

A complete product detail page with server-side rendering and URL parameters.

**Features:**
- Product details (name, description, media gallery)
- Dynamic pricing with discount indicators
- Real-time inventory status (fast rendering phase)
- Variant/option selection (size, color, etc.)
- Quantity controls
- Add to cart with loading states

**Rendering Phases:**
- **Slow:** Product details, media, options, categories (SSG/ISR)
- **Fast:** Inventory status, real-time availability (SSR)
- **Interactive:** Variant selection, quantity, add to cart (Client)

**Usage:**

```typescript
import { productPage } from '@jay-framework/wix-stores';

// Automatically creates pages for all products at /products/[slug]
export const page = productPage;
```

**URL Parameters:**
- `slug` - Product slug (e.g., `/products/gaming-laptop`)

---

### Product Card

A product card component for listings and grids with server-side rendering.

**Features:**
- Product thumbnail and main image
- Price with compare-at price
- Real-time inventory status (fast rendering phase)
- Product ribbon/badge
- Quick add to cart

**Rendering Phases:**
- **Slow:** Product info, media, pricing (SSG/ISR)
- **Fast:** Inventory status (SSR)
- **Interactive:** Add to cart action (Client)

**Usage:**

```typescript
import { productCard, ProductCardProps } from '@jay-framework/wix-stores';

// Use in a listing page
const props: ProductCardProps = {
  productId: 'product-123'
};
```

---

### Category Page

A category/collection page with product listings, filtering, and pagination.

**Features:**
- Category details (name, description, media)
- Breadcrumb navigation
- Product grid (async loading)
- Filtering (price range, in-stock only)
- Sorting (price, name, newest)
- Pagination

**Rendering Phases:**
- **Slow:** Category details, media, breadcrumbs (SSG/ISR)
- **Fast:** Product count, pagination metadata (SSR)
- **Interactive:** Filtering, sorting, navigation (Client)

**Usage:**

```typescript
import { categoryPage } from '@jay-framework/wix-stores';

// Automatically creates pages for all categories at /categories/[slug]
export const page = categoryPage;
```

**URL Parameters:**
- `slug` - Category slug (e.g., `/categories/electronics`)

---

### Product Search

A product search component with filtering, sorting, and pagination.

**Features:**
- Search input with fuzzy search support
- Category filtering
- Price range filtering
- In-stock filtering
- Multiple sort options
- Pagination with load more option
- Search suggestions

**Rendering Phases:**
- **Slow:** Available categories for filtering (SSG/ISR)
- **Fast:** Initial empty state (SSR)
- **Interactive:** Search execution, filtering, sorting (Client)

**Usage:**

```typescript
import { productSearch } from '@jay-framework/wix-stores';

// Use as a search page
export const page = productSearch;
```

## API Clients

You can also use the Wix Stores API clients directly:

### Products V3 Client

The headless components use the **Products V3 API** (Catalog V3) for enhanced features and better type safety.

```typescript
import { getProductsV3Client } from '@jay-framework/wix-stores';

const products = getProductsV3Client();

// Get a single product
const { product } = await products.getProduct('product-id');

// Query products
const { items } = await products.queryProducts()
  .eq('visible', true)
  .find();
```

### Collections Client

```typescript
import { getCollectionsClient } from '@jay-framework/wix-stores';

const collections = getCollectionsClient();

// Get a single collection
const collection = await collections.getCollection('collection-id');

// Query collections
const { collection } = await collections.queryCollections().find();
```

### Inventory Client

```typescript
import { getInventoryClient } from '@jay-framework/wix-stores';

const inventory = getInventoryClient();

// Query inventory
const { items } = await inventory.queryInventoryItems()
  .eq('productId', 'product-123')
  .find();
```

## Client-Side Cart and Search

When OAuth is configured in `@jay-framework/wix-server-client`, this package provides client-side cart and search operations that bypass server round-trips.

### Enabling Client-Side Operations

1. Configure OAuth in `./config/.wix.yaml`:

```yaml
oauthStrategy:
  clientId: "your-oauth-client-id"
```

2. The plugin automatically enables client-side operations during initialization.

### Using Client-Side Cart

```typescript
import { useContext } from '@jay-framework/runtime';
import { WIX_STORES_CLIENT_CONTEXT } from '@jay-framework/wix-stores';

function CartComponent(props, refs) {
    const stores = useContext(WIX_STORES_CLIENT_CONTEXT);
    
    if (!stores.isEnabled) {
        console.log('Client cart not available');
        return;
    }

    // Get current cart
    refs.loadCart.onclick(async () => {
        const cart = await stores.cart.getCart();
        console.log(`Cart has ${cart.itemCount} items`);
    });

    // Add to cart (direct API call - no server round-trip)
    refs.addToCart.onclick(async () => {
        const cart = await stores.cart.addToCart('product-id', 1);
        console.log(`Added! Cart now has ${cart.itemCount} items`);
    });

    // Update quantity
    refs.updateQty.onclick(async () => {
        const cart = await stores.cart.updateQuantity('line-item-id', 3);
    });

    // Remove item
    refs.remove.onclick(async () => {
        const cart = await stores.cart.removeItem('line-item-id');
    });
}
```

### Using Client-Side Search

```typescript
import { useContext } from '@jay-framework/runtime';
import { WIX_STORES_CLIENT_CONTEXT } from '@jay-framework/wix-stores';

function SearchComponent(props, refs) {
    const stores = useContext(WIX_STORES_CLIENT_CONTEXT);

    refs.searchInput.oninput(async (e) => {
        const query = e.target.value;
        
        // Search products (direct API call)
        const results = await stores.search.searchProducts(query, 10);
        
        // results: [{ id, name, slug, price, formattedPrice, imageUrl }]
        console.log(`Found ${results.length} products`);
    });
}
```

### Client vs Server Operations

| Operation | Server Action | Client API |
|-----------|--------------|------------|
| Add to cart | `addToCart({...})` | `stores.cart.addToCart(productId)` |
| Search products | `searchProducts({...})` | `stores.search.searchProducts(query)` |
| Get cart | `getCart()` | `stores.cart.getCart()` |
| Latency | ~100-300ms | ~50-100ms |
| Auth | API Key | OAuth Visitor Token |

**When to use client-side operations:**
- Real-time search autocomplete
- Quick add-to-cart buttons
- Cart indicator updates
- Any operation where latency matters

**When to use server actions:**
- Initial page load data
- SEO-critical content
- Operations requiring admin permissions

### Plugin Initialization Flow

Both plugins use the `makeJayInit` pattern for consolidated server/client initialization:

```
┌─────────────────────────────────────────────────────────────────────┐
│              wix-server-client (lib/init.ts - init first)           │
├─────────────────────────────────────────────────────────────────────┤
│  withServer: return { oauthClientId }                               │
│  withClient: Creates OAuth client, stores tokens in localStorage    │
│              Registers WIX_CLIENT_CONTEXT                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (depends on via package.json)
┌─────────────────────────────────────────────────────────────────────┐
│                  wix-stores (lib/init.ts - init second)             │
├─────────────────────────────────────────────────────────────────────┤
│  withServer: Registers WIX_STORES_SERVICE_MARKER                    │
│              return { enableClientCart, enableClientSearch }        │
│  withClient: Uses WIX_CLIENT_CONTEXT to create cart/search APIs     │
│              Registers WIX_STORES_CLIENT_CONTEXT                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Key benefits of `makeJayInit` pattern:**
- Single file for both server and client init
- Automatic type flow from `withServer` return to `withClient` parameter
- Compiler strips `withServer` from client bundle and `withClient` from server bundle

## Architecture

### Three-Phase Rendering

Jay Stack components use a three-phase rendering model:

1. **Slow Rendering (Build Time / ISR)**
   - Renders semi-static data that doesn't change often
   - Product details, descriptions, media
   - Executed during build or on-demand revalidation

2. **Fast Rendering (Request Time / SSR)**
   - Renders dynamic data that changes frequently
   - Inventory status, real-time pricing
   - Executed on every request with caching

3. **Interactive Rendering (Client Side)**
   - Handles user interactions
   - Form submissions, cart actions
   - Executed in the browser

### Server Context

Server contexts provide dependency injection for server-side rendering:

```typescript
import { WixStoresContext } from '@jay-framework/wix-stores';

// In slow render function
async function renderSlowlyChanging(
  props: PageProps & ProductPageParams,
  wixStores: WixStoresContext  // Injected context
) {
  // Access Wix API clients (Products V3)
  const { product } = await wixStores.products.getProduct(props.productId);
  
  // Use V3 API structure
  const price = product.priceData?.price;
  const comparePrice = product.priceData?.comparePrice;
  // ...
}
```

## Type Safety

All components and APIs are fully typed:

```typescript
import type {
  ProductPageContract,
  ProductCardContract,
  CategoryPageContract,
  ProductSearchContract,
  WixStoresContext
} from '@jay-framework/wix-stores';
```

## Documentation

For more information, see:

- [Jay Stack Documentation](../../jay/docs/core/jay-stack.md)
- [Wix Stores Products V3 (Catalog V3) API](https://dev.wix.com/docs/sdk/backend-modules/stores/catalog-v3/introduction)
- [Wix Stores Collections API](https://dev.wix.com/docs/sdk/backend-modules/stores/collections/introduction)
- [Wix Stores Inventory API](https://dev.wix.com/docs/sdk/backend-modules/stores/inventory/introduction)

## Examples

See the Jay Stack examples for usage patterns:
- `/jay/examples/jay-stack/fake-shop` - E-commerce example with product pages

## License

Apache-2.0
