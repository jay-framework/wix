# @jay-framework/wix-server-client

A Wix SDK client for the Jay Framework with support for both server-side API Key authentication and client-side OAuth visitor authentication.

## Installation

```bash
yarn add @jay-framework/wix-server-client
```

## Configuration

Create a configuration file at `./config/.wix.yaml` relative to your process execution path:

```yaml
# Server-side API Key authentication (required)
apiKeyStrategy:
  apiKey: "your-api-key-here"
  siteId: "your-site-id-here"

# Client-side OAuth authentication (optional)
# Enables direct API calls from the browser
oauthStrategy:
  clientId: "your-oauth-client-id-here"
```

### Configuration Fields

**apiKeyStrategy** (required):
- `apiKey`: Your Wix API key (string, required)
- `siteId`: Your Wix site ID (string, required)

**oauthStrategy** (optional):
- `clientId`: OAuth client ID for visitor authentication

## Server-Side Usage

```typescript
import { getWixClient } from '@jay-framework/wix-server-client';
import { products } from '@wix/stores';

// Get the API Key authenticated client
const wixClient = getWixClient();

// Make server-side API calls
const productsClient = wixClient.use(products);
const myProducts = await productsClient.queryProducts().find();
```

## Client-Side OAuth Authentication

When `oauthStrategy.clientId` is configured, the plugin enables client-side API calls using OAuth visitor tokens. This is useful for:

- Add to cart without server round-trip
- Real-time search autocomplete
- Client-side cart management

### How It Works

Based on the [Wix Headless Visitor Authentication Guide](https://dev.wix.com/docs/go-headless/develop-your-project/self-managed-headless/authentication/visitors/handle-visitors-using-the-js-sdk):

1. **Server Init**: Passes OAuth `clientId` to the client via `setClientInitData`
2. **Client Init**: Creates an OAuth-authenticated Wix client
3. **Token Management**: Visitor tokens are stored in `localStorage` for session persistence
4. **Session Resume**: On page reload, existing tokens are used to resume the visitor session

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SERVER (lib/init.ts - withServer)                 │
├─────────────────────────────────────────────────────────────────────┤
│  Config: oauthStrategy.clientId = "abc123"                          │
│  return { oauthClientId: "abc123" }  // typed data for client       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (embedded in HTML)
┌─────────────────────────────────────────────────────────────────────┐
│                    CLIENT (lib/init.ts - withClient)                 │
├─────────────────────────────────────────────────────────────────────┤
│  1. Receive typed data from withServer                              │
│  2. Check localStorage for existing tokens                          │
│  3. Create OAuthStrategy client with clientId                       │
│  4. If no tokens: generateVisitorTokens() and store                 │
│  5. If tokens exist: validate/refresh and resume session            │
│  6. Register WIX_CLIENT_CONTEXT for component access                │
└─────────────────────────────────────────────────────────────────────┘
```

### Using the Client in Components

```typescript
import { useContext } from '@jay-framework/runtime';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';

// In your interactive component
function MyComponent(props, refs) {
    const wixClient = useContext(WIX_CLIENT_CONTEXT);
    
    if (wixClient.isReady) {
        // Make client-side API calls
        const tokens = wixClient.getTokens();
        console.log('Visitor session active');
    }
}
```

### Token Storage

Tokens are automatically stored in `localStorage` under the key `wix_visitor_tokens`:

```typescript
// Clear tokens (for logout or session reset)
import { clearStoredTokens } from '@jay-framework/wix-server-client';

clearStoredTokens();
```

## Plugin Initialization

This package uses the `makeJayInit` pattern for consolidated server/client initialization:

### lib/init.ts

```typescript
import { makeJayInit } from '@jay-framework/fullstack-component';
import { loadConfig } from './config-loader.js';
import { registerGlobalContext } from '@jay-framework/runtime';

export const init = makeJayInit()
    .withServer(async () => {
        const config = loadConfig();
        
        // Pass OAuth client ID to client for visitor authentication
        return {
            oauthClientId: config.oauth?.clientId || null,
        };
    })
    .withClient(async (data) => {
        // Set up OAuth-authenticated Wix client
        // Token management with localStorage
        registerGlobalContext(WIX_CLIENT_CONTEXT, clientContext);
    });
```

### Initialization Order

1. `wix-server-client` must initialize before `wix-stores`
2. Add `wix-server-client` as a dependency in your project's `package.json`
3. Plugin dependencies in `package.json` determine initialization order

## API Reference

### Server-Side

#### `getWixClient(): WixClient`

Returns a server-side Wix client authenticated with API Key.

#### `getOAuthClientId(): string | undefined`

Returns the OAuth client ID from config, or undefined if not configured.

#### `loadConfig(): WixConfig`

Loads and validates the configuration from `./config/.wix.yaml`.

### Client-Side

#### `WIX_CLIENT_CONTEXT`

Context marker for accessing the Wix client in components.

```typescript
interface WixClientContext {
    client: WixClient | null;
    isReady: boolean;
    getTokens(): Tokens | null;
    generateVisitorTokens(): Promise<Tokens>;
    refreshToken(): Promise<Tokens>;
}
```

#### `getWixClientInstance(): WixClient | null`

Get the global Wix client instance for imperative access.

#### `clearStoredTokens(): void`

Clear stored visitor tokens from localStorage.

## Error Handling

The `loadConfig()` function will throw descriptive errors if:
- The config file is not found at `./config/.wix.yaml`
- The YAML syntax is invalid
- Required fields (`apiKey`, `siteId`) are missing
- Required fields are empty strings

## License

Apache-2.0
