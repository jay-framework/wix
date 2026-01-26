# Wix Stores Cart Problem

A static webpage demonstrating Wix SDK usage with OAuth visitor authentication.

## Features

- **productsV3 API** - Fetches products from Wix Stores (Catalog V3)
- **currentCart API** - Gets the visitor's shopping cart
- **OAuth Authentication** - Uses visitor tokens for browser-side API calls
- **Session Persistence** - Tokens stored in localStorage

## Setup

### 1. Copy dependencies from parent project

Since npm is blocked, copy the node_modules from the parent wix workspace:

```bash
cd /Users/yoav/work/jay/wix/exploration/wix-stores-cart-problem

# Option A: Symlink to parent node_modules (recommended)
ln -s ../../node_modules node_modules

# Option B: Or copy the specific packages you need
mkdir -p node_modules/@wix
cp -r ../../node_modules/@wix/sdk node_modules/@wix/
cp -r ../../node_modules/@wix/stores node_modules/@wix/
cp -r ../../node_modules/@wix/ecom node_modules/@wix/
```

### 2. Configure OAuth Client ID

Edit `src/wix-client.ts` and replace the placeholder with your OAuth Client ID:

```typescript
const OAUTH_CLIENT_ID = "your-actual-client-id";
```

Get your OAuth Client ID from:
1. Go to [Wix Dashboard](https://manage.wix.com/)
2. Navigate to Settings → Headless Settings
3. Create or select a project
4. Copy the OAuth Client ID

### 3. Run Development Server

```bash
# Start Vite dev server (hot reload)
npm run dev

# Or build for production
npm run build

# Preview production build
npm run preview
```

The dev server will open at http://localhost:3000

## Project Structure

```
static-wix-page/
├── src/
│   ├── wix-client.ts    # Wix SDK client with OAuth setup
│   ├── main.ts          # Main app - products & cart API calls
│   └── index.html       # Static HTML page
├── dist/                # Compiled output
├── config/              # Config files (optional)
├── package.json
├── tsconfig.json
└── README.md
```

## API Usage

### Products (productsV3)

```typescript
import { productsV3 } from "@wix/stores";

const client = getWixClient();
const productsClient = client.use(productsV3);

const response = await productsClient
    .queryProducts({
        fields: ['CURRENCY', 'MEDIA_ITEMS_INFO', 'THUMBNAIL']
    })
    .limit(12)
    .find();
```

### Current Cart

```typescript
import { currentCart } from "@wix/ecom";

const client = getWixClient();
const cartClient = client.use(currentCart);

const cart = await cartClient.getCurrentCart();
```

## Configuration

### OAuth vs API Key

This demo uses **OAuth visitor authentication** which:
- Works in the browser (client-side)
- Creates anonymous visitor sessions
- Suitable for cart operations without login
- Tokens are stored in localStorage

For server-side operations, use **API Key authentication** instead.

### Wix Documentation

- [Wix SDK](https://dev.wix.com/docs/sdk)
- [Products V3 API](https://dev.wix.com/docs/sdk/backend-modules/stores/catalog-v3/introduction)
- [Current Cart API](https://dev.wix.com/docs/sdk/backend-modules/ecom/current-cart/introduction)
- [Visitor Authentication](https://dev.wix.com/docs/go-headless/develop-your-project/self-managed-headless/authentication/visitors/handle-visitors-using-the-js-sdk)

## Troubleshooting

### "Please set your OAuth Client ID"

Edit `src/wix-client.ts` and set your actual OAuth Client ID from Wix Dashboard.

### CORS Errors

Wix APIs should work from any origin when using OAuth. If you see CORS errors:
1. Make sure you're using a proper HTTP server (not `file://`)
2. Check that your OAuth client is configured correctly in Wix

### "Cart not found"

This is normal for new visitors who haven't added anything to their cart yet.
The cart is created automatically when items are added.
