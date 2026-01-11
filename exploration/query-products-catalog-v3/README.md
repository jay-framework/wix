# Query Wix Products using Catalog V3 API

This project demonstrates three different ways to fetch product data from a Wix store using the Wix Catalog V3 API:

1. **queryProducts** - Query all products with pagination
2. **getProduct** - Fetch individual products by ID
3. **getProductBySlug** - Fetch individual products by slug

## Setup

### 1. Install Dependencies

```bash
npm install
# or
yarn install
```

### 2. Configure API Key

Edit `config/.wix.yaml` and replace `YOUR_API_KEY_HERE` with your actual Wix API key:

```yaml
apiKeyStrategy:
  apiKey: "your-actual-api-key"
  siteId: "3c482edc-8dfc-4681-aa87-3d6b36c231a2"
```

### 3. Get Your Wix API Key

1. Go to your [Wix Developer Account](https://manage.wix.com/account/api-keys)
2. Create a new API key or use an existing one
3. Make sure the API key has permissions for:
   - **Stores** → Read Products

## Usage

### 1. Query All Products (queryProducts API)

This fetches all products using pagination:

```bash
npm start
# or
yarn start
```

### 2. Fetch Products by ID (getProduct API)

After running the query above, fetch individual products using their IDs:

```bash
npm run get-product
# or
yarn get-product
```

### 3. Fetch Products by Slug (getProductBySlug API)

Fetch individual products using their URL slugs:

```bash
npm run get-product-by-slug
# or
yarn get-product-by-slug
```

### Build and Run Compiled Code

```bash
npm run build
node dist/query-products.js
node dist/get-product.js
node dist/get-product-by-slug.js
```

## Output

The scripts will create an `output` directory with the following structure:

```
output/
├── all-products.json           # All products from queryProducts
├── summary.json                # Summary with product count and metadata
├── individual/                 # Individual JSON files from queryProducts
│   ├── {product-id}_product-name.json
│   └── ...
├── get-product/                # Products fetched by ID
│   ├── {product-id}_product-name.json
│   ├── all-fetched-products.json
│   └── fetch-summary.json
└── get-product-by-slug/        # Products fetched by slug
    ├── {slug}_product-name.json
    ├── all-fetched-products.json
    └── fetch-summary.json
```

### Files Created:

**From queryProducts (npm start):**
1. **all-products.json** - Array of all products with complete data
2. **summary.json** - Overview with product count, IDs, and names
3. **individual/{product-id}_{name}.json** - One file per product

**From getProduct (npm run get-product):**
1. **get-product/{product-id}_{name}.json** - Each product fetched by ID
2. **get-product/all-fetched-products.json** - All products in one file
3. **get-product/fetch-summary.json** - Success/failure statistics

**From getProductBySlug (npm run get-product-by-slug):**
1. **get-product-by-slug/{slug}_{name}.json** - Each product fetched by slug
2. **get-product-by-slug/all-fetched-products.json** - All products in one file
3. **get-product-by-slug/fetch-summary.json** - Success/failure and comparison stats

## Features

### queryProducts API (query-products.ts)
- ✅ Fetches all products using pagination
- ✅ Saves to multiple formats (all-in-one, individual files, summary)
- ✅ Progress tracking during fetch
- ✅ Supports all product fields including currency, descriptions, media, etc.

### getProduct API (get-product.ts)
- ✅ Fetches products individually by ID
- ✅ Error handling for missing products
- ✅ Success/failure tracking for each product
- ✅ Generates detailed fetch summary

### getProductBySlug API (get-product-by-slug.ts)
- ✅ Fetches products individually by URL slug
- ✅ Error handling for missing products
- ✅ Compares fetched data with original queryProducts data
- ✅ Detailed analysis of data consistency

### Common Features
- ✅ Type-safe TypeScript code
- ✅ Safe filename generation
- ✅ Comprehensive error handling
- ✅ Detailed logging and progress tracking

## Configuration

The script uses:
- **Site ID**: `3c482edc-8dfc-4681-aa87-3d6b36c231a2`
- **Page Size**: 100 products per API call (max supported)
- **Safety Limit**: 1000 pages (100,000 products max)

## Troubleshooting

### Error: "Config file not found"
Make sure you're running the script from the project directory where `config/.wix.yaml` exists.

### Error: "Please replace YOUR_API_KEY_HERE"
You need to add your actual Wix API key in `config/.wix.yaml`.

### API Permission Errors
Ensure your API key has the necessary permissions to read products from the Wix Stores catalog.

## API Reference

This project demonstrates these Wix Catalog V3 APIs:

### queryProducts
Queries all products with pagination and filtering options.
- Module: `@wix/stores` - `productsV3.queryProducts()`
- Use case: Bulk product fetching, catalog browsing
- Returns: Paginated list of products with hasNext() for pagination

### getProduct
Fetches a single product by its ID.
- Module: `@wix/stores` - `productsV3.getProduct(productId)`
- Use case: Fetch specific product when you have the ID
- Returns: Single product object

### getProductBySlug
Fetches a single product by its URL slug.
- Module: `@wix/stores` - `productsV3.getProductBySlug(slug)`
- Use case: Fetch product from URL-friendly slug
- Returns: Single product object

**SDK Documentation:**
- [@wix/sdk](https://www.npmjs.com/package/@wix/sdk) - Wix JavaScript SDK
- [@wix/stores](https://www.npmjs.com/package/@wix/stores) - Wix Stores API module

## License

Apache-2.0

