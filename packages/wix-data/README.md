# @jay-framework/wix-data

Wix Data API client for the Jay Framework. This package provides a convenient wrapper around `@wix/data` that uses the configured Wix client from `@jay-framework/wix-server-client`.

## Installation

```bash
yarn add @jay-framework/wix-data
```

## Prerequisites

Make sure you have configured `@jay-framework/wix-server-client` with a valid `./config/.wix.yaml` file. See the [wix-server-client documentation](../wix-server-client/README.md) for configuration details.

## Usage

### Quick Start

```typescript
import { getItemsClient, getCollectionsClient } from '@jay-framework/wix-data';

// Get pre-configured clients
const itemsClient = getItemsClient();
const collectionsClient = getCollectionsClient();

// Query data items
const results = await itemsClient.queryDataItems({
  dataCollectionId: 'myCollection'
}).find();

// Get collections
const allCollections = await collectionsClient.listDataCollections();
```

### Advanced Usage

You can also use the Wix client directly:

```typescript
import { getClient } from '@jay-framework/wix-server-client';
import { items, collections } from '@jay-framework/wix-data';

const wixClient = getClient();
const itemsClient = wixClient.use(items);
const collectionsClient = wixClient.use(collections);

// Use the clients...
```

### Working with Data Items

```typescript
import { getItemsClient } from '@jay-framework/wix-data';

const itemsClient = getItemsClient();

// Query items
const items = await itemsClient.queryDataItems({
  dataCollectionId: 'products'
})
.eq('status', 'active')
.find();

// Get a single item
const item = await itemsClient.getDataItem(
  'item-id',
  { dataCollectionId: 'products' }
);

// Insert an item
const newItem = await itemsClient.insertDataItem({
  dataCollectionId: 'products',
  dataItem: {
    data: {
      name: 'New Product',
      price: 29.99
    }
  }
});

// Update an item
const updatedItem = await itemsClient.updateDataItem(
  'item-id',
  {
    dataCollectionId: 'products',
    dataItem: {
      data: {
        price: 24.99
      }
    }
  }
);

// Remove an item
await itemsClient.removeDataItem(
  'item-id',
  { dataCollectionId: 'products' }
);
```

### Working with Collections

```typescript
import { getCollectionsClient } from '@jay-framework/wix-data';

const collectionsClient = getCollectionsClient();

// List all collections
const collections = await collectionsClient.listDataCollections();

// Get a specific collection
const collection = await collectionsClient.getDataCollection('myCollection');
```

## API Reference

### `getItemsClient()`

Returns a configured Wix Data Items client (singleton).

The Items API allows you to access and manage items in a Wix site's data collections.

**Returns:** Items client instance from `@wix/data`

**Documentation:** [Wix Data Items API](https://dev.wix.com/docs/sdk/backend-modules/data/items/introduction)

### `getCollectionsClient()`

Returns a configured Wix Data Collections client (singleton).

The Collections API allows you to manage a site's data collections.

**Returns:** Collections client instance from `@wix/data`

**Documentation:** [Wix Data Collections API](https://dev.wix.com/docs/sdk/backend-modules/data/collections/introduction)

## Re-exported Types

This package re-exports all types and functions from `@wix/data`, so you can import them directly:

```typescript
import { 
  items, 
  collections,
  type DataItem,
  type DataCollection,
  // ... all other exports from @wix/data
} from '@jay-framework/wix-data';
```

## Configuration

This package uses the configuration from `@jay-framework/wix-server-client`. Make sure you have a `./config/.wix.yaml` file configured. See the [wix-server-client README](../wix-server-client/README.md) for details.

## License

Apache-2.0

