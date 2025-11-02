# @jay-framework/wix-stores

Wix Stores API client for the Jay Framework. This package provides a convenient wrapper around `@wix/stores` that uses the configured Wix client from `@jay-framework/wix-server-client`.

## Installation

```bash
yarn add @jay-framework/wix-stores
```

## Prerequisites

Make sure you have configured `@jay-framework/wix-server-client` with a valid `./config/.wix.yaml` file. See the [wix-server-client documentation](../wix-server-client/README.md) for configuration details.

## Usage

### Quick Start

```typescript
import { 
  getProductsClient,
  getProductsV3Client,
  getCollectionsClient,
  getInventoryClient 
} from '@jay-framework/wix-stores';

// Get pre-configured clients
const productsClient = getProductsClient();
const productsV3Client = getProductsV3Client(); // New Catalog V3 API
const collectionsClient = getCollectionsClient();
const inventoryClient = getInventoryClient();

// Query products
const products = await productsClient.queryProducts().find();

// Get a specific product
const product = await productsClient.getProduct('product-id');
```

### Advanced Usage

You can also use the Wix client directly:

```typescript
import { getClient } from '@jay-framework/wix-server-client';
import { products, productsV3, collections, inventory } from '@jay-framework/wix-stores';

const wixClient = getClient();
const productsClient = wixClient.use(products);
const productsV3Client = wixClient.use(productsV3);
const collectionsClient = wixClient.use(collections);
const inventoryClient = wixClient.use(inventory);

// Use the clients...
```

### Working with Products

```typescript
import { getProductsClient } from '@jay-framework/wix-stores';

const productsClient = getProductsClient();

// Query all products
const allProducts = await productsClient.queryProducts().find();

// Query products with filters
const activeProducts = await productsClient.queryProducts()
  .eq('visible', true)
  .gt('price', 10)
  .find();

// Get a single product
const product = await productsClient.getProduct('product-id');

// Query product variants
const variants = await productsClient.queryProductVariants({
  productId: 'product-id'
}).find();
```

### Working with Products V3 (Catalog V3)

```typescript
import { getProductsV3Client } from '@jay-framework/wix-stores';

const productsV3Client = getProductsV3Client();

// Query products with the new V3 API
const products = await productsV3Client.queryProducts().find();

// Get a product by ID
const product = await productsV3Client.getProduct('product-id');

// Create a new product
const newProduct = await productsV3Client.createProduct({
  product: {
    name: 'New Product',
    priceData: {
      price: 29.99
    }
  }
});
```

**Note:** The Products V3 API is part of the new Catalog V3 system. See the [Catalog V3 documentation](https://dev.wix.com/docs/sdk/backend-modules/stores/catalog-v3/introduction) for more details.

### Working with Collections

```typescript
import { getCollectionsClient } from '@jay-framework/wix-stores';

const collectionsClient = getCollectionsClient();

// Query collections
const collections = await collectionsClient.queryStoreCollections().find();

// Get a specific collection
const collection = await collectionsClient.getStoreCollection('collection-id');

// Query products by collection
const collectionProducts = await collectionsClient.queryStoreCollectionProducts({
  collectionId: 'collection-id'
}).find();
```

### Working with Inventory

```typescript
import { getInventoryClient } from '@jay-framework/wix-stores';

const inventoryClient = getInventoryClient();

// Query inventory items
const inventory = await inventoryClient.queryInventoryItems().find();

// Get product inventory
const productInventory = await inventoryClient.getInventoryItem('product-id');

// Update inventory
await inventoryClient.updateInventoryVariants({
  productId: 'product-id',
  variants: [{
    variantId: 'variant-id',
    quantity: 100,
    inStock: true
  }]
});
```

## API Reference

### `getProductsClient()`

Returns a configured Wix Stores Products client (singleton).

The Products API allows you to manage products in your Wix store.

**Returns:** Products client instance from `@wix/stores`

**Documentation:** [Wix Stores Products API](https://dev.wix.com/docs/sdk/backend-modules/stores/products/introduction)

### `getProductsV3Client()`

Returns a configured Wix Stores Products V3 client (singleton).

The Products V3 API is part of the new Catalog V3 system that provides advanced product management capabilities for sophisticated e-commerce applications.

**Returns:** Products V3 client instance from `@wix/stores`

**Documentation:** [Wix Stores Catalog V3](https://dev.wix.com/docs/sdk/backend-modules/stores/catalog-v3/introduction)

### `getCollectionsClient()`

Returns a configured Wix Stores Collections client (singleton).

The Collections API allows you to manage product collections in your Wix store.

**Returns:** Collections client instance from `@wix/stores`

**Documentation:** [Wix Stores Collections API](https://dev.wix.com/docs/sdk/backend-modules/stores/collections/introduction)

### `getInventoryClient()`

Returns a configured Wix Stores Inventory client (singleton).

The Inventory API allows you to manage product inventory in your Wix store.

**Returns:** Inventory client instance from `@wix/stores`

**Documentation:** [Wix Stores Inventory API](https://dev.wix.com/docs/sdk/backend-modules/stores/inventory/introduction)

## Re-exported Types

This package re-exports all types and functions from `@wix/stores`, so you can import them directly:

```typescript
import { 
  products,
  productsV3,
  collections,
  inventory,
  type Product,
  type Collection,
  // ... all other exports from @wix/stores
} from '@jay-framework/wix-stores';
```

## Configuration

This package uses the configuration from `@jay-framework/wix-server-client`. Make sure you have a `./config/.wix.yaml` file configured. See the [wix-server-client README](../wix-server-client/README.md) for details.

## License

Apache-2.0

