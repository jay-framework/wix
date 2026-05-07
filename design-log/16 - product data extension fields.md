# Design Log 16: Product Data Extension Fields

## Background

Wix Stores V3 products support **data extension fields** — custom fields defined per-site via the [Data Extension Schema API](https://dev.wix.com/docs/api-reference/business-management/data-extension-schema/list-data-extension-schemas?apiView=SDK). These fields are stored on the product under `extendedFields` and their schema is retrieved via `listDataExtensionSchemas('wix.stores.v3.product')`.

The current `product-page` contract in wix-stores is a fixed/static contract. It doesn't include any site-specific custom fields. To render these fields in jay-html templates, the contract needs to be materialized at setup time to include the data extension fields.

## Problem

1. **Static contract** — `product-page.jay-contract` is hardcoded. Custom fields like `fabricComposition`, `careInstructions`, `embroidery` are invisible to the contract system.
2. **No data extension integration** — The wix-stores package doesn't call the data extension schema API at all.
3. **Site-specific fields** — Each Wix site defines its own custom fields. The contract must be generated per-site.

## Questions and Answers

**Q1: Should product-page become a fully dynamic contract (like wix-data), or should we extend the static contract?**
A: Extend the static base. The product-page contract has complex structure (options, modifiers, media gallery, etc.) that should remain as a static base. The data extension fields are appended as an additional sub-contract (e.g. `extendedFields`).

**Q2: Where do data extension fields appear on the product API response?**
A: On the product object under `extendedFields._user_fields` (the namespace from the schema). Accessed via `product.extendedFields?.namespaces?._user_fields` in the SDK response.

**Q3: Should the `product-search` contract also get extended fields?**
A: Not in this iteration. Search results typically show summary cards, not full product details. Extended fields are primarily for the product detail page.

**Q4: How should the JSON Schema types map to contract tag types?**

| JSON Schema type     | Contract dataType | Contract structure                       |
| -------------------- | ----------------- | ---------------------------------------- |
| `string`             | `string`          | `data` tag                               |
| `boolean`            | `boolean`         | `data` tag                               |
| `number`             | `number`          | `data` tag                               |
| `array` (of strings) | `string`          | `data` tag (repeated)                    |
| `array` (of objects) | —                 | `sub-contract` (repeated, trackBy index) |

**Q5: Should the generator be in wix-stores or a shared utility?**
A: The JSON Schema → contract tag mapping is generic and could be reused. Put it in wix-stores for now as a utility, move to shared if needed later.

## Design

### 1. JSON Schema → Contract Tags (Generic Utility)

A function `jsonSchemaToContractTags` that converts a JSON Schema `properties` object to contract YAML tags:

```typescript
interface JsonSchemaProperty {
  type: string;
  items?: JsonSchemaProperty & { properties?: Record<string, JsonSchemaProperty> };
  properties?: Record<string, JsonSchemaProperty>;
  maxLength?: number;
  maxItems?: number;
}

function jsonSchemaToContractTags(
  properties: Record<string, JsonSchemaProperty>,
  indent = 4,
): string[];
```

For each property:

- `type: "string"` → `{tag: fieldName, type: data, dataType: string}`
- `type: "boolean"` → `{tag: fieldName, type: data, dataType: boolean}`
- `type: "number"` → `{tag: fieldName, type: data, dataType: number}`
- `type: "array"`, `items.type: "string"` → `{tag: fieldName, type: data, dataType: string}` (repeated values rendered as comma-separated or similar)
- `type: "array"`, `items.type: "object"` → sub-contract with `repeated: true`, `trackBy: _index`, nested tags from `items.properties`

### 2. Contract Materialization

The product-page contract becomes a **dynamic contract** declared in `plugin.yaml`:

```yaml
dynamic_contracts:
  - prefix: 'product-page'
    component: productPage
    generator: productPageContractGenerator
```

The generator:

1. Reads the base static contract YAML
2. Calls `listDataExtensionSchemas('wix.stores.v3.product')`
3. Converts the JSON schema to contract tags via the generic utility
4. Appends an `extendedFields` sub-contract to the base contract
5. Returns the materialized contract

### 3. Component Mapping

In `product-page.ts`, the slow render phase:

1. Fetches the product (already done)
2. Extracts `product.extendedFields?.namespaces?._user_fields`
3. Maps each field value to the `extendedFields` view state

The mapping is straightforward — field names in the schema match field names on the product object.

### 4. Example Output

Given the schema from `dataExtensionSchemas.json`, the materialized contract would add:

```yaml
- tag: extendedFields
  type: sub-contract
  description: Custom product fields from data extension schema
  tags:
    - { tag: embroidery, type: data, dataType: boolean }
    - { tag: comingSoon, type: data, dataType: boolean }
    - { tag: fabricComposition, type: data, dataType: string }
    - { tag: fabricWeight, type: data, dataType: string }
    - { tag: countryOfOrigin, type: data, dataType: string }
    - { tag: density, type: data, dataType: string }
    - { tag: chain, type: data, dataType: string }
    - { tag: fragile, type: data, dataType: boolean }
    - tag: sizeContent
      type: sub-contract
      repeated: true
      trackBy: _index
      description: sizeContent items
      tags:
        - { tag: value, type: data, dataType: string }
    - tag: icons
      type: sub-contract
      repeated: true
      trackBy: _index
      description: icons items
      tags:
        - { tag: text, type: data, dataType: string }
        - { tag: mediaId, type: data, dataType: string }
    - tag: colorCodeMap
      type: sub-contract
      repeated: true
      trackBy: _index
      description: colorCodeMap items
      tags:
        - { tag: code, type: data, dataType: string }
        - { tag: name, type: data, dataType: string }
        - { tag: groupCode, type: data, dataType: string }
```

### 5. Jay-HTML Usage

```html
<div if="productPage.extendedFields.fabricComposition">
  <strong>Fabric:</strong> {productPage.extendedFields.fabricComposition}
</div>
<div if="productPage.extendedFields.embroidery">
  <span class="badge">Embroidery Available</span>
</div>
<ul forEach="productPage.extendedFields.careInstructions" trackBy="_index">
  <li>{value}</li>
</ul>
```

## Implementation Plan

### Phase 1: Generic JSON Schema → Contract Utility

1. Create `packages/wix-stores/lib/utils/data-extension-schema.ts`
2. Implement `jsonSchemaToContractTags(properties, indent)` — converts JSON schema properties to YAML tag strings
3. Implement `buildExtendedFieldsSubContract(schemas)` — wraps tags in an `extendedFields` sub-contract

### Phase 2: Contract Generator

1. Add `dynamic_contracts` to `packages/wix-stores/plugin.yaml`
2. Create `packages/wix-stores/lib/generators/product-page-contract-generator.ts`
3. Generator reads base contract, appends extended fields sub-contract
4. Export generator from `index.ts`

### Phase 3: Component Mapping

1. Update `product-page.ts` slow render to extract `extendedFields` from product
2. Map extended field values to the view state
3. Handle missing fields gracefully (undefined → empty string/false)

### Phase 4: Setup Integration

1. Update `setup.ts` to call `listDataExtensionSchemas` during references generation
2. Cache schema in references for agent discovery

## Trade-offs

| Decision                                  | Pros                                         | Cons                                              |
| ----------------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| `extendedFields` sub-contract             | Clean namespace, no collision with base tags | One extra nesting level in templates              |
| Generic JSON Schema mapper                | Reusable for other entities                  | May need extending for edge-case types            |
| Dynamic contract (generator)              | Per-site customization                       | Requires `jay-stack agent-kit` to materialize     |
| Array of strings as repeated sub-contract | Consistent pattern, works with forEach       | More verbose than a simple comma-separated string |

## Verification Criteria

1. Running `jay-stack agent-kit` produces a materialized `product-page` contract with extended fields
2. Extended field values appear in the rendered product page
3. Missing extended fields render as empty (no errors)
4. Array fields (both string arrays and object arrays) render correctly with forEach
5. Boolean fields work with if/unless conditionals

## Implementation Results

### Files Created

- `packages/wix-stores/lib/utils/data-extension-schema.ts` — Generic JSON Schema → contract tag utility with `jsonSchemaToContractTags()` and `buildExtendedFieldsSubContract()`
- `packages/wix-stores/lib/generators/product-page-contract-generator.ts` — Contract generator that reads base contract + appends extended fields

### Files Modified

- `packages/wix-stores/lib/services/wix-stores-service.ts` — Added `getDataExtensionSchemas()` method (lazy-cached call to `listDataExtensionSchemas('wix.stores.catalog.v3.product')`)
- `packages/wix-stores/vite.config.ts` — Added `@wix/data-extension-schema` to rollup externals
- `packages/wix-stores/package.json` — Added `@wix/data-extension-schema` dependency
- `packages/wix-stores/lib/components/product-page.ts` — Added `mapExtendedFields()` and included `extendedFields` in slow-phase view state
- `packages/wix-stores/plugin.yaml` — Moved product-page from `contracts` to `dynamic_contracts` with generator reference
- `packages/wix-stores/lib/index.ts` — Exported `productPageContractGenerator`
- `packages/wix-stores/lib/setup.ts` — References handler now fetches and writes `data-extension-fields.yaml`

### Key Decisions

- **extendedFields as sub-contract**: All extension fields are nested under an `extendedFields` tag to avoid name collisions with base contract tags
- **\_user_fields namespace**: The generator specifically looks for the `_user_fields` namespace, which contains user-defined custom fields
- **Array of primitives**: Mapped as a simple `data` tag (runtime handles array rendering). Array of objects → repeated sub-contract with nested tags.
- **Lazy caching**: `getDataExtensionSchemas()` caches the API result, consistent with `getCategoryTree()` and `getCustomizations()` patterns

### Deviations from Design

1. **FQDN changed**: Design proposed `wix.stores.v3.product` but the correct FQDN is `wix.stores.catalog.v3.product`. Fixed after testing against the live API.
2. **Base contract inlined**: Instead of reading the base contract YAML from the filesystem at runtime (`fs.readFileSync`), the contract is inlined as a `BASE_CONTRACT_YAML` const in the generator. This avoids file-path resolution issues across different build tools and deployment environments.
3. **Generator name field removed**: The design assumed the generator returns `name: 'product-page'`, but the framework constructs the contract name as `{prefix}/{name}`. With `prefix: 'product-page'` this produced `product-page/product-page`. Fixed by omitting the `name` field from the generator return — the framework uses the prefix alone.
4. **`@wix/data-extension-schema` dependency**: Had to be explicitly added to `packages/wix-stores/package.json` and to `vite.config.ts` externals. The package was only installed at the workspace root for the exploration project.
5. **Success logging added**: `getDataExtensionSchemas()` logs the count of schemas and fields on successful load, making it easier to diagnose issues like the initial 0-fields problem.
