# @jay-framework/wix-server-client

A server-side client for interacting with Wix APIs, designed to work seamlessly with the Jay Framework.

## Installation

```bash
yarn add @jay-framework/wix-server-client
```

## Configuration

Create a configuration file at `./config/.wix.yaml` relative to your process execution path:

```yaml
apiKeyStrategy:
  apiKey: "your-api-key-here"
  siteId: "your-site-id-here"
```

### Configuration Fields

Under the `apiKeyStrategy` section:

- **apiKey**: Your Wix API key (string, required)
- **siteId**: Your Wix site ID (string, required)

## Usage

The expected usage is to import Wix SDK packages and use them with the client:

```typescript
import { getClient } from '@jay-framework/wix-server-client';
import { items, collections } from '@wix/data';
import { products } from '@wix/stores';

// Get the configured Wix client
const wixClient = getClient();

// Use specific Wix modules
const itemsClient = wixClient.use(items);
const collectionsClient = wixClient.use(collections);
const productsClient = wixClient.use(products);

// Make API calls
const myItems = await itemsClient.queryDataItems({
  dataCollectionId: 'myCollection'
}).find();

const myProducts = await productsClient.queryProducts().find();
```

## API Reference

### `getClient(): WixClient`

Returns a configured Wix client instance. The client is a singleton - subsequent calls will return the same instance.

The configuration is automatically loaded from `./config/.wix.yaml` on the first call.

**Example:**
```typescript
import { getClient } from '@jay-framework/wix-server-client';

const client = getClient();
```

### `loadConfig(): WixConfig`

Manually loads and validates the configuration from `./config/.wix.yaml`.

**Returns:**
```typescript
interface WixConfig {
    apiKey: string;
    siteId: string;
}
```

**Throws:**
- Error if config file is not found
- Error if YAML is invalid
- Error if required fields are missing or empty

**Example:**
```typescript
import { loadConfig } from '@jay-framework/wix-server-client';

try {
    const config = loadConfig();
    console.log('Site ID:', config.siteId);
} catch (error) {
    console.error('Failed to load config:', error.message);
}
```

## Available Wix SDK Modules

You can use any Wix SDK module with the client. Common modules include:

- `@wix/data` - Data collections
- `@wix/stores` - E-commerce stores
- `@wix/ecom` - E-commerce operations
- And many more from the Wix SDK ecosystem

Install the modules you need:

```bash
yarn add @wix/data @wix/stores
```

## Error Handling

The `loadConfig()` function will throw descriptive errors if:
- The config file is not found at `./config/.wix.yaml`
- The YAML syntax is invalid
- Required fields (`apiKey`, `siteId`) are missing
- Required fields are empty strings

Make sure to handle these errors appropriately in your application.

## License

Apache-2.0

