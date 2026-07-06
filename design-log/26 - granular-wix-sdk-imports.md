# Design Log 26: Granular Wix SDK Imports

## Status

Draft

## Background

The Wix packages (`wix-stores`, `wix-stores-v1`, `wix-cart`) import entire SDK module namespaces via barrel packages:

```typescript
import { productsV3, customizationsV3, inventoryItemsV3 } from '@wix/stores';
import { categories } from '@wix/categories';
import { currentCart } from '@wix/ecom';
```

Each namespace is then passed to `wixClient.use(productsV3)` to create a typed API client. The problem: `productsV3` alone is 482KB — it re-exports 31 functions plus hundreds of enum/type definitions from `@wix/auto_sdk_stores_products-v-3`. Most of these functions are never called.

This matters because the Wix SDK is used **on the client** — cart operations (add to cart, remove, update quantity, checkout) and product variant resolution all run in the browser. The full module namespaces inflate the client bundle with unused code.

## Problem

Reduce client bundle size by importing only the specific SDK functions used, instead of entire module namespaces.

## Exploration Results

### `wixClient.use()` accepts individual function descriptors

Confirmed via `/exploration/query-products-catalog-v3/test-granular-import.ts`:

```typescript
import { getProduct, getProductBySlug, queryProducts } from '@wix/auto_sdk_stores_products-v-3';
const client = wixClient.use({ getProduct, getProductBySlug, queryProducts });
// ✅ Works — client.getProduct(), client.getProductBySlug(), client.queryProducts()
```

Each exported function from the auto_sdk packages is a `RESTFunctionDescriptor` that `wixClient.use()` accepts individually.

### SDK function usage by package

#### wix-data

| Module      | Function            | Where                                                       | Server/Client |
| ----------- | ------------------- | ----------------------------------------------------------- | ------------- |
| items       | `query`             | collection-list, collection-item, collection-table, actions | Both          |
| items       | `get`               | collection-item (ref lookups), collection-list, actions     | Both          |
| collections | `getDataCollection` | wix-data-service                                            | Server        |

#### wix-stores (V3)

| Module               | Function                   | Where                                                           | Server/Client |
| -------------------- | -------------------------- | --------------------------------------------------------------- | ------------- |
| productsV3           | `getProductBySlug`         | product-page slow, actions                                      | Server        |
| productsV3           | `queryProducts`            | product-page loadParams                                         | Server        |
| productsV3           | `searchProducts`           | actions                                                         | Server        |
| productsV3           | `getProduct`               | actions (getVariantStock), client context (addToCart)           | Both          |
| categories           | `queryCategories`          | stores-service, category-list, product-search, related-products | Server        |
| categories           | `getCategory`              | product-search                                                  | Server        |
| customizationsV3     | `queryCustomizations`      | stores-service                                                  | Server        |
| inventoryItemsV3     | —                          | Imported but unused                                             | —             |
| dataExtensionSchemas | `listDataExtensionSchemas` | stores-service                                                  | Server        |

**Client-side:** Only `productsV3.getProduct` is called from the browser (for variant resolution during add-to-cart).

#### wix-stores-v1 (V1)

| Module      | Function           | Where                    | Server/Client |
| ----------- | ------------------ | ------------------------ | ------------- |
| products    | `queryProducts`    | product-page, actions    | Server        |
| collections | `queryCollections` | collection-list, actions | Server        |
| inventory   | —                  | Imported but unused      | —             |

**Client-side:** No V1 SDK calls from the browser.

#### wix-cart

| Module      | Function                            | Where            | Server/Client |
| ----------- | ----------------------------------- | ---------------- | ------------- |
| currentCart | `getCurrentCart`                    | cart-helpers     | Both          |
| currentCart | `estimateCurrentCartTotals`         | cart-helpers     | Both          |
| currentCart | `addToCurrentCart`                  | wix-cart-context | Client        |
| currentCart | `removeLineItemsFromCurrentCart`    | wix-cart-context | Client        |
| currentCart | `updateCurrentCartLineItemQuantity` | wix-cart-context | Client        |
| currentCart | `updateCurrentCart`                 | wix-cart-context | Client        |
| currentCart | `removeCouponFromCurrentCart`       | wix-cart-context | Client        |
| currentCart | `createCheckoutFromCurrentCart`     | wix-cart-context | Client        |
| redirects   | `createRedirectSession`             | wix-cart-context | Client        |

**Client-side:** All 9 functions are used from the browser.

## Design

### Approach: Replace barrel imports with granular auto_sdk imports

Change from:

```typescript
import { productsV3 } from '@wix/stores';
const client = wixClient.use(productsV3); // all 31 functions
```

To:

```typescript
import { getProduct, queryProducts } from '@wix/auto_sdk_stores_products-v-3';
const client = wixClient.use({ getProduct, queryProducts }); // only what we need
```

### Changes per package

#### wix-stores

**`lib/utils/wix-store-api.ts`** — replace module namespace imports with granular function imports:

```typescript
// Before
import { customizationsV3, inventoryItemsV3, productsV3 } from '@wix/stores';
import { categories } from '@wix/categories';

// After
import {
  getProduct,
  getProductBySlug,
  queryProducts,
  searchProducts,
} from '@wix/auto_sdk_stores_products-v-3';
import { queryCategories, getCategory } from '@wix/auto_sdk_categories_categories';
import { queryCustomizations } from '@wix/auto_sdk_stores_customizations-v-3';
```

Update client factory functions to use `wixClient.use({ getProduct, getProductBySlug, ... })`.

Remove `inventoryItemsV3` — imported but never called.

**`vite.config.ts`** — update externals: replace `@wix/stores`, `@wix/categories` with the specific auto_sdk packages.

**`package.json`** — replace `@wix/stores` and `@wix/categories` dependencies with their auto_sdk equivalents.

#### wix-data

**`lib/services/wix-data-service.ts`** — replace barrel imports:

```typescript
// Before
import { items, collections } from '@wix/data';

// After
import { query, get } from '@wix/wix-data-items-sdk';
import { getDataCollection } from '@wix/auto_sdk_data_collections';
```

Update `getItemsClient` and `getCollectionsClient` to use `wixClient.use({ query, get })` and `wixClient.use({ getDataCollection })`.

**`lib/contexts/wix-data-context.ts`** — same pattern for client-side:

```typescript
// Before
import { items } from '@wix/data';

// After
import { query, get } from '@wix/wix-data-items-sdk';
```

**`package.json`** — replace `@wix/data` with `@wix/wix-data-items-sdk` and `@wix/auto_sdk_data_collections`.

#### wix-stores-v1

**`lib/utils/wix-store-v1-api.ts`** — same pattern:

```typescript
// Before
import { products, collections, inventory } from '@wix/stores';

// After
import { queryProducts } from '@wix/auto_sdk_stores_products';
import { queryCollections } from '@wix/auto_sdk_stores_collections';
```

Remove `inventory` — imported but never called.

#### wix-cart

**`lib/utils/cart-client.ts`** — granular ecom imports:

```typescript
// Before
import { currentCart } from '@wix/ecom';

// After
import {
  getCurrentCart,
  estimateCurrentCartTotals,
  addToCurrentCart,
  removeLineItemsFromCurrentCart,
  updateCurrentCartLineItemQuantity,
  updateCurrentCart,
  removeCouponFromCurrentCart,
  createCheckoutFromCurrentCart,
} from '@wix/auto_sdk_ecom_current-cart';
```

**`lib/utils/redirects-client.ts`** — granular redirects import:

```typescript
// Before
import { redirects } from '@wix/redirects';

// After
import { createRedirectSession } from '@wix/auto_sdk_redirects_redirects';
```

### Type imports

Type imports from the auto_sdk packages remain unchanged — they're already granular and tree-shake away at build time:

```typescript
import type { SeoSchema, VariantsInfo } from '@wix/auto_sdk_stores_products-v-3';
```

### Auto_sdk packages availability

All required auto_sdk packages are published on npm:

| Package                                       | Version | Barrel source                            |
| --------------------------------------------- | ------- | ---------------------------------------- |
| `@wix/auto_sdk_stores_products-v-3`           | 1.0.192 | `@wix/stores` → `productsV3`             |
| `@wix/auto_sdk_categories_categories`         | 1.0.123 | `@wix/categories` → `categories`         |
| `@wix/auto_sdk_stores_customizations-v-3`     | 1.0.87  | `@wix/stores` → `customizationsV3`       |
| `@wix/auto_sdk_stores_products`               | 1.0.98  | `@wix/stores` → `products` (V1)          |
| `@wix/auto_sdk_stores_collections`            | 1.0.41  | `@wix/stores` → `collections` (V1)       |
| `@wix/auto_sdk_ecom_current-cart`             | 1.0.171 | `@wix/ecom` → `currentCart`              |
| `@wix/auto_sdk_redirects_redirects`           | 1.0.45  | `@wix/redirects` → `redirects`           |
| `@wix/auto_sdk_data-extension-schema_schemas` | 1.0.230 | `@wix/data-extension-schema` → `schemas` |
| `@wix/wix-data-items-sdk`                     | 1.0.525 | `@wix/data` → `items`                    |
| `@wix/auto_sdk_data_collections`              | 1.0.87  | `@wix/data` → `collections`              |

These should be added as explicit dependencies in each package's `package.json`, replacing the barrel package dependencies.

### Questions & Answers

Q1: The `wixClient.use()` return type changes when passing individual functions vs. a full module namespace. Should we update the singleton instance types in the client factories, or let TypeScript infer them?

A: Use direct imports from the auto_sdk sub-packages. Let TypeScript infer the return types from `wixClient.use()`.

Q2: Should we measure the bundle size before and after to quantify the improvement?

A: Yes — measure both client and server bundles before and after.

### Server bundle matters too

The server bundle size is also important because of how `wix-deploy` bundles the application for deployment. The deploy pipeline creates a single server bundle that includes all dependencies — large unused SDK modules inflate the deployed artifact. Granular imports should be applied to both client and server code paths.

## Implementation Plan

### Phase 1: wix-cart (highest client-side impact)

All 9 SDK functions run in the browser. Replace barrel imports with granular ones in `cart-client.ts` and `redirects-client.ts`. Update `vite.config.ts` externals and `package.json` dependencies.

### Phase 2: wix-stores

Replace barrel imports in `wix-store-api.ts`. Only `getProduct` runs client-side, but the full `productsV3` (482KB) is imported because the client factory file is shared between server and client. Remove unused `inventoryItemsV3`.

### Phase 3: wix-data

Replace `import { items, collections } from '@wix/data'` with granular imports from `@wix/wix-data-items-sdk` and `@wix/auto_sdk_data_collections` in both `wix-data-service.ts` (server) and `wix-data-context.ts` (client). The `@wix/data` barrel pulls in 18 sub-packages — we use only 2.

### Phase 4: wix-stores-v1

Replace barrel imports in `wix-store-v1-api.ts`. No client-side SDK calls, but still reduces server bundle. Remove unused `inventory`.

### Phase 5: Build & verify

- Build all three packages
- Run examples to verify API calls still work
- Compare client bundle sizes before/after

### Pre-change module sizes

The barrel packages (`@wix/stores`, etc.) are tiny wrappers (1-3KB) that re-export entire auto_sdk modules. The real cost:

| Auto_sdk module                               | Size  | Used by       |
| --------------------------------------------- | ----- | ------------- |
| `@wix/auto_sdk_stores_products-v-3`           | 471KB | wix-stores    |
| `@wix/auto_sdk_data-extension-schema_schemas` | 150KB | wix-stores    |
| `@wix/auto_sdk_categories_categories`         | 146KB | wix-stores    |
| `@wix/auto_sdk_stores_products`               | 75KB  | wix-stores-v1 |
| `@wix/auto_sdk_ecom_current-cart`             | 54KB  | wix-cart      |
| `@wix/auto_sdk_stores_customizations-v-3`     | 51KB  | wix-stores    |
| `@wix/auto_sdk_stores_collections`            | 10KB  | wix-stores-v1 |
| `@wix/auto_sdk_redirects_redirects`           | 7KB   | wix-cart      |
| `@wix/wix-data-items-sdk`                     | 88KB  | wix-data      |
| `@wix/auto_sdk_data_collections`              | 63KB  | wix-data      |

When passing a full module namespace to `wixClient.use(productsV3)`, the bundler cannot tree-shake — the entire 471KB object is used as a runtime value. With `wixClient.use({ getProduct })`, only the imported function and its dependencies survive tree-shaking.

## Trade-offs

| Decision                               | Benefit                              | Cost                                                                                          |
| -------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Import from auto_sdk packages directly | Only ship functions we use           | Coupling to Wix internal package naming                                                       |
| Remove unused modules (inventory)      | Cleaner dependency graph             | Would need to re-add if we use them later                                                     |
| Shared client factory files            | One import point for server + client | Server-only functions still imported in client entry — though tree-shaking should handle this |
