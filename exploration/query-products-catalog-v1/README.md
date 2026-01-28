# Query Products - Catalog V1 API

This exploration project queries all products from a Wix store using the **Catalog V1 API**.

## Catalog V1 vs V3

- **Catalog V1**: The original products API, uses `products` module from `@wix/stores`
- **Catalog V3**: The newer API (rolling out Q2 2025), uses `productsV3` module

This project demonstrates the V1 API for comparison with the V3 project.

## Setup

1. Install dependencies:
   ```bash
   yarn install
   ```

2. Configure credentials in `config/.wix.yaml`:
   ```yaml
   apiKeyStrategy:
     apiKey: "YOUR_API_KEY_HERE"
     siteId: "YOUR_SITE_ID_HERE"
   ```

## Usage

Run the query:
```bash
yarn start
```

## Output

Results are saved to the `output/` directory:
- `all-products.json` - All products in a single file
- `individual/` - Each product in its own file
- `summary.json` - Query metadata and product list

## Key Differences from V3

| Feature | V1 | V3 |
|---------|----|----|
| Module import | `products` | `productsV3` |
| Product ID field | `_id` | `id` |
| Response format | Older schema | Newer schema with more fields |
| Pagination | `skip`-based | Cursor-based via `hasNext()` |
