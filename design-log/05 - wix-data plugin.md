# Design Log #05: Wix Data Plugin for Jay Framework

## Background

The Jay Framework has a `wix-stores` plugin that provides headless components for e-commerce (product pages, category pages, cart, etc.). We need a similar plugin for **Wix Data** - a generic CMS/database system that allows site owners to create custom collections with arbitrary schemas.

Unlike wix-stores which has a fixed schema (products, categories, cart), wix-data is schema-agnostic. The plugin must read collection schemas at build time and generate appropriate contracts using the **dynamic contracts** pattern.

### Reference Implementation

The `wix-stores` plugin at `/wix/packages/wix-stores` demonstrates:
- Service pattern (`WixStoresService`, `WIX_STORES_SERVICE_MARKER`)
- Component definitions using `makeJayStackComponent()` with slow/fast/interactive phases
- Contract definitions (`.jay-contract` files)
- Actions using `makeJayQuery()`
- Plugin initialization using `makeJayInit()`

The dynamic contracts pattern is documented in `/jay/design-log/60 - plugin system refinement and dynamic contracts.md`.

## Problem

Site developers using Wix Data need headless components to:
1. Display individual items from a collection (item page)
2. Display all items in a collection (index page)
3. Display items filtered by a category/reference (category page)
4. Embed item lists within other pages (table widget)
5. Embed single items within other pages (card widget)

The challenge: contracts must be **generated dynamically** from collection schemas, not hardcoded.

## Questions and Answers

### Q1: How do we discover collection schemas?
**A:** Use the Wix Data Collections API:
- `listDataCollections()` - https://dev.wix.com/docs/sdk/backend-modules/data/collections/list-data-collections
- `getDataCollection()` - https://dev.wix.com/docs/sdk/backend-modules/data/collections/get-data-collection

Read schemas at build time during contract generation.

### Q2: How do we configure which collections to expose?
**A:** Configuration file (`wix-data.config.yaml`) that specifies:
- Which collections to generate components for
- URL routing (slug field, path prefix)
- Category relationships
- Reference handling (embed vs link)
- Which components to enable

### Q3: Should components be generated or configured at runtime?
**A:** Use **dynamic contracts** (see design log #60). The generator:
1. Reads collection schema from Wix Data API
2. Generates contracts with tags matching the actual fields
3. All generated contracts share a single component implementation
4. Component receives contract via `DYNAMIC_CONTRACT_SERVICE`

### Q4: How do we handle multi-reference fields for categories?
**A:** Configuration specifies which field is the "category" reference. The component queries items filtered by that reference.

### Q5: How do we handle dynamic schemas in contracts?
**A:** Use **dynamic contracts** - the generator creates a contract per collection with tags for each field. No field-to-viewState mappings needed in config since the contract IS the schema.

### Q6: What about nested/embedded references?
**A:** Configuration specifies which reference fields to "expand" - the component fetches related items and embeds them in the view state.

## Design

### Package Structure

```
wix/packages/wix-data/
├── lib/
│   ├── index.ts                    # Server exports
│   ├── index.client.ts             # Client exports
│   ├── init.ts                     # Plugin initialization
│   ├── config/
│   │   ├── config-types.ts         # Configuration types
│   │   └── config-loader.ts        # Load & validate config
│   ├── services/
│   │   └── wix-data-service.ts     # Server-side data service
│   ├── contexts/
│   │   └── wix-data-context.ts     # Client-side context
│   ├── components/
│   │   ├── collection-item.ts      # Shared component for item pages
│   │   ├── collection-list.ts      # Shared component for list pages
│   │   ├── collection-table.ts     # Shared component for tables
│   │   └── collection-card.ts      # Shared component for cards
│   ├── generators/
│   │   ├── item-contract-generator.ts
│   │   ├── list-contract-generator.ts
│   │   ├── table-contract-generator.ts
│   │   └── card-contract-generator.ts
│   ├── actions/
│   │   └── data-actions.ts         # Query actions
│   └── utils/
│       ├── schema-to-contract.ts   # Convert Wix schema to contract YAML
│       └── item-mapper.ts          # Map data to view state
├── plugin.yaml
├── package.json
└── README.md
```

### Configuration Schema (Simplified - No Field Mappings)

```typescript
// config-types.ts

export interface WixDataConfig {
  collections: CollectionConfig[];
}

export interface CollectionConfig {
  /** Wix Data collection ID */
  collectionId: string;
  
  /** URL path prefix (e.g., "/blog" for blog posts) */
  pathPrefix: string;
  
  /** Field to use as URL slug (required for routing) */
  slugField: string;
  
  /** Reference field configurations */
  references?: ReferenceConfig[];
  
  /** Category configuration (for category pages) */
  category?: CategoryConfig;
  
  /** Components to generate */
  components: ComponentsConfig;
}

export interface ReferenceConfig {
  /** Reference field name */
  fieldName: string;
  
  /** How to handle: 'embed' (fetch & include) or 'link' (just ID/slug) */
  mode: 'embed' | 'link';
}

export interface CategoryConfig {
  /** Multi-reference field that links to category collection */
  referenceField: string;
  
  /** Field in category collection to use as slug */
  categorySlugField: string;
}

export interface ComponentsConfig {
  /** Generate item page */
  itemPage?: boolean;
  
  /** Generate index page */
  indexPage?: boolean;
  
  /** Generate category pages */
  categoryPage?: boolean;
  
  /** Generate table widget */
  tableWidget?: boolean;
  
  /** Generate card widget */
  cardWidget?: boolean;
}
```

### Configuration File Example

```yaml
# wix-data.config.yaml
collections:
  - collectionId: "BlogPosts"
    pathPrefix: "/blog"
    slugField: "slug"
    references:
      - fieldName: "author"
        mode: embed
    category:
      referenceField: "categories"
      categorySlugField: "slug"
    components:
      itemPage: true
      indexPage: true
      categoryPage: true
      cardWidget: true

  - collectionId: "Team"
    pathPrefix: "/team"
    slugField: "slug"
    components:
      itemPage: true
      indexPage: true
      cardWidget: true
      
  - collectionId: "Products"
    pathPrefix: "/products"
    slugField: "sku"
    references:
      - fieldName: "manufacturer"
        mode: embed
    components:
      itemPage: true
      indexPage: true
      tableWidget: true
```

### Dynamic Contract Generation

#### Plugin YAML with Dynamic Contracts

```yaml
# plugin.yaml
name: wix-data

# Dynamic contracts - generated from Wix Data schemas
dynamic_contracts:
  # Item pages - one contract per collection
  - prefix: 'item'
    component: ./components/collection-item
    generator: ./generators/item-contract-generator.ts
    
  # List pages (index & category) - one contract per collection
  - prefix: 'list'
    component: ./components/collection-list
    generator: ./generators/list-contract-generator.ts
    
  # Table widgets - one contract per collection
  - prefix: 'table'
    component: ./components/collection-table
    generator: ./generators/table-contract-generator.ts
    
  # Card widgets - one contract per collection  
  - prefix: 'card'
    component: ./components/collection-card
    generator: ./generators/card-contract-generator.ts

actions:
  - queryItems
  - getItemBySlug
  - getCategories
```

#### Contract Generator Implementation

```typescript
// generators/item-contract-generator.ts

import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER } from '../services/wix-data-service';
import { schemaToContractYaml } from '../utils/schema-to-contract';

export const generator = makeContractGenerator()
  .withServices(WIX_DATA_SERVICE_MARKER)
  .generateWith(async (wixDataService) => {
    const config = wixDataService.config;
    const contracts: { name: string; yaml: string }[] = [];
    
    for (const collectionConfig of config.collections) {
      if (!collectionConfig.components.itemPage) continue;
      
      // Fetch collection schema from Wix Data API
      const schema = await wixDataService.collections.getDataCollection(
        collectionConfig.collectionId
      );
      
      // Generate contract YAML from schema
      const yaml = schemaToContractYaml(schema, {
        type: 'item',
        embedReferences: collectionConfig.references?.filter(r => r.mode === 'embed'),
      });
      
      contracts.push({
        name: toPascalCase(collectionConfig.collectionId) + 'Item',
        yaml,
      });
    }
    
    return contracts;
  });

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}
```

#### Schema to Contract Converter

```typescript
// utils/schema-to-contract.ts

import { DataCollection, Field } from '@wix/data';

interface ConversionOptions {
  type: 'item' | 'list' | 'table' | 'card';
  embedReferences?: { fieldName: string }[];
}

export function schemaToContractYaml(
  collection: DataCollection,
  options: ConversionOptions
): string {
  const tags: string[] = [];
  
  // Always include _id
  tags.push(`  - {tag: _id, type: data, dataType: string}`);
  
  // Map each field from schema
  for (const field of collection.fields || []) {
    const tag = fieldToTag(field, options);
    if (tag) tags.push(tag);
  }
  
  // Add interactive elements based on type
  if (options.type === 'list') {
    tags.push(`  - {tag: loadMoreButton, type: interactive, elementType: HTMLButtonElement}`);
    tags.push(`  - {tag: hasMore, type: variant, dataType: boolean, phase: fast+interactive}`);
    tags.push(`  - {tag: isLoading, type: variant, dataType: boolean, phase: fast+interactive}`);
  }
  
  if (options.type === 'table') {
    tags.push(`  - {tag: prevButton, type: interactive, elementType: HTMLButtonElement}`);
    tags.push(`  - {tag: nextButton, type: interactive, elementType: HTMLButtonElement}`);
  }
  
  if (options.type === 'card' || options.type === 'item') {
    tags.push(`  - {tag: itemLink, type: interactive, elementType: HTMLAnchorElement}`);
  }
  
  return `name: ${collection._id}
tags:
${tags.join('\n')}`;
}

function fieldToTag(field: Field, options: ConversionOptions): string | null {
  const { key, type } = field;
  
  // Skip system fields
  if (key.startsWith('_') && key !== '_id') return null;
  
  const dataType = mapWixTypeToJayType(type);
  
  // Check if this is an embedded reference
  const isEmbedded = options.embedReferences?.some(r => r.fieldName === key);
  
  if (type === 'REFERENCE' || type === 'MULTI_REFERENCE') {
    if (isEmbedded) {
      // Embedded reference becomes a sub-contract
      return `  - tag: ${key}
    type: sub-contract
    ${type === 'MULTI_REFERENCE' ? 'repeated: true\n    trackBy: _id' : ''}
    description: Embedded ${key} reference`;
    } else {
      // Linked reference is just an ID
      return `  - {tag: ${key}, type: data, dataType: string, description: Reference ID}`;
    }
  }
  
  if (type === 'IMAGE') {
    return `  - tag: ${key}
    type: sub-contract
    tags:
      - {tag: url, type: data, dataType: string}
      - {tag: altText, type: data, dataType: string}
      - {tag: width, type: data, dataType: number}
      - {tag: height, type: data, dataType: number}`;
  }
  
  return `  - {tag: ${key}, type: data, dataType: ${dataType}}`;
}

function mapWixTypeToJayType(wixType: string): string {
  const typeMap: Record<string, string> = {
    'TEXT': 'string',
    'NUMBER': 'number',
    'BOOLEAN': 'boolean',
    'DATE': 'string',
    'DATETIME': 'string',
    'TIME': 'string',
    'RICH_TEXT': 'string',
    'URL': 'string',
    'DOCUMENT': 'string',
    'VIDEO': 'string',
    'AUDIO': 'string',
    'ARRAY': 'string',
    'OBJECT': 'string',
  };
  return typeMap[wixType] || 'string';
}
```

### Shared Component Implementation

```typescript
// components/collection-item.ts

import {
  makeJayStackComponent,
  PageProps,
  RenderPipeline,
  Signals,
  UrlParams,
  DYNAMIC_CONTRACT_SERVICE,
} from '@jay-framework/fullstack-component';
import { Contract } from '@jay-framework/compiler-shared';
import { WIX_DATA_SERVICE_MARKER, WixDataService } from '../services/wix-data-service';

export interface ItemPageParams extends UrlParams {
  slug: string;
}

/**
 * Shared component for all collection item pages.
 * Receives contract via DYNAMIC_CONTRACT_SERVICE to determine which collection to query.
 */
export const collectionItem = makeJayStackComponent<any>() // Dynamic contract type
  .withProps<PageProps>()
  .withServices(WIX_DATA_SERVICE_MARKER, DYNAMIC_CONTRACT_SERVICE)
  .withLoadParams(loadItemParams)
  .withSlowlyRender(renderSlowlyChanging);

async function* loadItemParams(
  [wixData, contract]: [WixDataService, Contract]
): AsyncIterable<ItemPageParams[]> {
  // Derive collection ID from contract name: "BlogPostsItem" -> "BlogPosts"
  const collectionId = deriveCollectionId(contract.name);
  const config = wixData.getCollectionConfig(collectionId);
  
  if (!config) {
    console.error(`No config found for collection: ${collectionId}`);
    yield [];
    return;
  }
  
  try {
    const result = await wixData.queryCollection(collectionId).find();
    yield result.items.map(item => ({
      slug: item.data?.[config.slugField] as string
    }));
  } catch (error) {
    console.error(`Failed to load slugs for ${collectionId}:`, error);
    yield [];
  }
}

async function renderSlowlyChanging(
  props: PageProps & ItemPageParams,
  wixData: WixDataService,
  contract: Contract
) {
  const collectionId = deriveCollectionId(contract.name);
  const config = wixData.getCollectionConfig(collectionId);
  
  const Pipeline = RenderPipeline.for<any, { itemId: string }>();
  
  return Pipeline
    .try(async () => {
      const result = await wixData.queryCollection(collectionId)
        .eq(config!.slugField, props.slug)
        .find();
      
      if (!result.items.length) {
        throw new Error('Item not found');
      }
      
      const item = result.items[0];
      
      // Fetch embedded references
      const viewState = await mapItemToViewState(item, config!, wixData);
      
      return { item, viewState };
    })
    .recover(() => Pipeline.clientError(404, 'Item not found'))
    .toPhaseOutput(({ item, viewState }) => ({
      viewState,
      carryForward: { itemId: item._id }
    }));
}

function deriveCollectionId(contractName: string): string {
  // "BlogPostsItem" -> "BlogPosts"
  // "TeamItem" -> "Team"
  return contractName.replace(/Item$/, '');
}

async function mapItemToViewState(
  item: any,
  config: CollectionConfig,
  wixData: WixDataService
): Promise<any> {
  const viewState: any = { _id: item._id };
  
  // Map all data fields directly - contract matches schema
  for (const [key, value] of Object.entries(item.data || {})) {
    if (key.startsWith('_')) continue;
    
    // Check if this is an embedded reference
    const refConfig = config.references?.find(r => r.fieldName === key);
    if (refConfig?.mode === 'embed' && value) {
      // Fetch referenced item(s)
      viewState[key] = await fetchReference(value, wixData);
    } else {
      viewState[key] = value;
    }
  }
  
  return viewState;
}

async function fetchReference(refValue: any, wixData: WixDataService): Promise<any> {
  // Handle single or multi-reference
  if (Array.isArray(refValue)) {
    return Promise.all(refValue.map(id => 
      wixData.items.getDataItem(id).then(r => r.dataItem?.data)
    ));
  }
  const result = await wixData.items.getDataItem(refValue);
  return result.dataItem?.data;
}
```

### Service Definition

```typescript
// wix-data-service.ts

import { WixClient } from '@wix/sdk';
import { items, collections } from '@wix/data';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { WixDataConfig, CollectionConfig } from '../config/config-types';

export interface WixDataService {
  items: ReturnType<typeof items>;
  collections: ReturnType<typeof collections>;
  config: WixDataConfig;
  
  getCollectionConfig(collectionId: string): CollectionConfig | undefined;
  queryCollection(collectionId: string): ReturnType<typeof items.queryDataItems>;
}

export const WIX_DATA_SERVICE_MARKER = createJayService<WixDataService>('Wix Data Service');

export function provideWixDataService(
  wixClient: WixClient,
  config: WixDataConfig
): WixDataService {
  const itemsClient = wixClient.use(items);
  const collectionsClient = wixClient.use(collections);
  
  const service: WixDataService = {
    items: itemsClient,
    collections: collectionsClient,
    config,
    
    getCollectionConfig(collectionId: string) {
      return config.collections.find(c => c.collectionId === collectionId);
    },
    
    queryCollection(collectionId: string) {
      return itemsClient.queryDataItems({
        dataCollectionId: collectionId
      });
    }
  };
  
  registerService(WIX_DATA_SERVICE_MARKER, service);
  return service;
}
```

### Plugin Initialization

```typescript
// init.ts

import { makeJayInit } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { WIX_CLIENT_SERVICE } from '@jay-framework/wix-server-client';
import { loadConfig } from './config/config-loader';
import { provideWixDataService } from './services/wix-data-service';
import { provideWixDataContext } from './contexts/wix-data-context';

export const init = makeJayInit()
  .withServer(async () => {
    console.log('[wix-data] Initializing Wix Data service...');
    
    const wixClient = getService(WIX_CLIENT_SERVICE);
    const config = await loadConfig();
    
    provideWixDataService(wixClient, config);
    
    console.log('[wix-data] Server initialization complete');
    
    return { collections: config.collections.map(c => c.collectionId) };
  })
  .withClient(async (data) => {
    console.log('[wix-data] Initializing client-side context...');
    
    provideWixDataContext();
    
    console.log('[wix-data] Client initialization complete');
  });
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. Create package structure
2. Implement configuration types and loader
3. Create service definition and registration
4. Set up plugin.yaml with dynamic_contracts

### Phase 2: Contract Generators
1. Implement `schema-to-contract.ts` utility
2. Implement item contract generator
3. Implement list contract generator
4. Implement table contract generator
5. Implement card contract generator

### Phase 3: Item Page Component
1. Implement shared `collection-item.ts` component
2. Add support for embedded references
3. Implement slow/fast rendering phases
4. Test with single collection

### Phase 4: List Components
1. Implement `collection-list.ts` component
2. Add index page functionality
3. Add category page filtering
4. Add pagination and "load more"

### Phase 5: Widget Components
1. Implement `collection-table.ts` component
2. Implement `collection-card.ts` component
3. Add sorting for table
4. Add pagination for table

### Phase 6: Actions & Client Context
1. Implement `queryItems` action
2. Implement `getItemBySlug` action
3. Implement `getCategories` action
4. Create client context for interactive features

### Phase 7: Documentation & Testing
1. Write README with usage examples
2. Create example configuration
3. Add integration tests

## Examples

### Using the Plugin

```html
<!-- blog/[slug].jay-html -->
<script type="application/jay-headless"
        plugin="@jay-framework/wix-data"
        contract="item/BlogPostsItem"
        key="post"
></script>

<article>
  <h1>{post.title}</h1>
  <img src="{post.featuredImage.url}" alt="{post.featuredImage.altText}" />
  
  <!-- Fields come directly from collection schema -->
  <div class="content">{post.content}</div>
  <time>{post.publishDate}</time>
  <span>{post.readTime} min read</span>
  
  <!-- Embedded author reference -->
  <div class="author">
    <img src="{post.author.avatar.url}" alt="{post.author.name}" />
    <span>{post.author.name}</span>
    <p>{post.author.bio}</p>
  </div>
</article>
```

### Index Page

```html
<!-- blog/index.jay-html -->
<script type="application/jay-headless"
        plugin="@jay-framework/wix-data"
        contract="list/BlogPostsList"
        key="posts"
></script>

<section class="blog-posts">
  <article forEach="posts.items" trackBy="_id">
    <a href="/blog/{slug}">
      <img src="{featuredImage.url}" alt="{title}" />
      <h2>{title}</h2>
      <p>{excerpt}</p>
    </a>
  </article>
  
  <button ref="posts.loadMoreButton" when="hasMore" is="true">
    Load More
  </button>
</section>
```

### Table Widget

```html
<!-- admin/posts.jay-html -->
<script type="application/jay-headless"
        plugin="@jay-framework/wix-data"
        contract="table/BlogPostsTable"
        key="postsTable"
></script>

<table>
  <thead>
    <tr>
      <th>Title</th>
      <th>Author</th>
      <th>Published</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    <tr forEach="postsTable.rows" trackBy="_id">
      <td><a ref="postsTable.rows.itemLink">{title}</a></td>
      <td>{author}</td>
      <td>{publishDate}</td>
      <td>{status}</td>
    </tr>
  </tbody>
</table>

<nav>
  <button ref="postsTable.prevButton">Previous</button>
  <button ref="postsTable.nextButton">Next</button>
</nav>
```

## Trade-offs

### Dynamic vs Static Contracts
- **Chosen:** Dynamic contracts generated from Wix Data schemas
- **Alternative:** Static generic contracts with field mappings
- **Rationale:** Dynamic contracts provide full type safety matching the actual schema. No need for field-to-viewState mappings since contract IS the schema.

### Single Shared Component vs Factory Pattern
- **Chosen:** Single component per type (item, list, table, card) using `DYNAMIC_CONTRACT_SERVICE`
- **Alternative:** Factory functions creating component instances per collection
- **Rationale:** Dynamic contracts pattern uses shared components - simpler architecture, contract metadata available at runtime via service.

### Configuration for Routing Only
- **Chosen:** Config specifies routing (slug field, path prefix) and relationships only
- **Alternative:** Full field mappings in config
- **Rationale:** With dynamic contracts, fields come directly from schema. Only routing and reference handling need configuration.

## Verification Criteria

1. **Contract Generation:** Contracts are generated matching Wix Data collection schemas
2. **Item Page Works:** Can navigate to `/blog/my-post` and see fields from schema
3. **Index Page Works:** Can see list of all posts at `/blog`
4. **Category Page Works:** Can see posts in category at `/blog/category/tech`
5. **Table Widget Works:** Can embed sortable, paginated table in any page
6. **Card Widget Works:** Can embed single item card in any page
7. **References Embedded:** Author reference is expanded in blog post view
8. **Type Safety:** Generated contracts provide autocomplete in jay-html
9. **Load More Works:** Client-side pagination loads more items
10. **Sorting Works:** Table columns can be sorted
