# Design Log #001: Wix Data Plugin for Jay Framework

## Background

The Jay Framework has a `wix-stores` plugin that provides headless components for e-commerce (product pages, category pages, cart, etc.). We need a similar plugin for **Wix Data** - a generic CMS/database system that allows site owners to create custom collections with arbitrary schemas.

Unlike wix-stores which has a fixed schema (products, categories, cart), wix-data is schema-agnostic. The plugin must read collection schemas at build time and generate appropriate components based on configuration.

### Reference Implementation

The `wix-stores` plugin at `/wix/packages/wix-stores` demonstrates:
- Service pattern (`WixStoresService`, `WIX_STORES_SERVICE_MARKER`)
- Component definitions using `makeJayStackComponent()` with slow/fast/interactive phases
- Contract definitions (`.jay-contract` files)
- Actions using `makeJayQuery()`
- Plugin initialization using `makeJayInit()`

## Problem

Site developers using Wix Data need headless components to:
1. Display individual items from a collection (item page)
2. Display all items in a collection (index page)
3. Display items filtered by a category/reference (category page)
4. Embed item lists within other pages (table widget)
5. Embed single items within other pages (card widget)

The challenge: these components must be **configured** per-collection, not hardcoded like wix-stores.

## Questions and Answers

### Q1: How do we discover collection schemas?
**A:** Use the Wix Data Collections API (`@wix/data` → `collections.getCollection()`) to read schema at build time. Cache results for the build session.

### Q2: How do we configure which collections to expose?
**A:** Configuration file (`wix-data.config.yaml` or `wix-data.config.ts`) that specifies:
- Which collections to generate components for
- Field mappings (slug field, title field, image field, etc.)
- Reference configurations (which refs to embed, which to use as categories)

### Q3: Should components be generated or configured at runtime?
**A:** **Configured at build time**. Each collection gets its own component instance created via factory functions. The contract is generic but the component behavior is configured.

### Q4: How do we handle multi-reference fields for categories?
**A:** Multi-reference fields in Wix Data link items to other collections. Configuration specifies which field to use as "category" and the plugin fetches related items.

### Q5: How do we handle dynamic schemas in contracts?
**A:** Use a **generic contract** with field mappings. The contract defines slots like `title`, `description`, `image`, `fields[]` and configuration maps actual collection fields to these slots.

### Q6: What about nested/embedded references?
**A:** Configuration specifies which reference fields to "expand" - the plugin fetches related items and embeds them in the view state.

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
│   │   ├── config-loader.ts        # Load & validate config
│   │   └── schema-reader.ts        # Read Wix Data schemas
│   ├── services/
│   │   └── wix-data-service.ts     # Server-side data service
│   ├── contexts/
│   │   └── wix-data-context.ts     # Client-side context
│   ├── components/
│   │   ├── item-page.ts            # Single item page
│   │   ├── index-page.ts           # Collection index page
│   │   ├── category-page.ts        # Items by category
│   │   ├── table-widget.ts         # Table widget
│   │   └── card-widget.ts          # Card widget
│   ├── contracts/
│   │   ├── data-item.jay-contract  # Generic item contract
│   │   ├── data-list.jay-contract  # List contract
│   │   ├── data-table.jay-contract # Table widget contract
│   │   └── data-card.jay-contract  # Card widget contract
│   ├── actions/
│   │   └── data-actions.ts         # Query actions
│   └── utils/
│       └── item-mapper.ts          # Map data to view state
├── plugin.yaml
├── package.json
└── README.md
```

### Configuration Schema

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
  
  /** Field mappings */
  fields: FieldMappings;
  
  /** Reference field configurations */
  references?: ReferenceConfig[];
  
  /** Category configuration (for category pages) */
  category?: CategoryConfig;
  
  /** Components to generate */
  components: ComponentsConfig;
}

export interface FieldMappings {
  /** Field to use as URL slug (required) */
  slug: string;
  
  /** Field to use as page title */
  title: string;
  
  /** Field for main content/description */
  description?: string;
  
  /** Field for main image */
  image?: string;
  
  /** Additional fields to include */
  additionalFields?: string[];
}

export interface ReferenceConfig {
  /** Reference field name */
  fieldName: string;
  
  /** How to handle: 'embed' (fetch & include) or 'link' (just ID/slug) */
  mode: 'embed' | 'link';
  
  /** Fields to include from referenced collection (if embed) */
  includeFields?: string[];
}

export interface CategoryConfig {
  /** Multi-reference field that links to category collection */
  referenceField: string;
  
  /** Category collection ID */
  categoryCollectionId: string;
  
  /** Field mappings for category items */
  categoryFields: {
    slug: string;
    title: string;
    description?: string;
    image?: string;
  };
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
    fields:
      slug: "slug"
      title: "title"
      description: "content"
      image: "featuredImage"
      additionalFields: ["author", "publishDate", "readTime"]
    references:
      - fieldName: "author"
        mode: embed
        includeFields: ["name", "avatar", "bio"]
    category:
      referenceField: "categories"
      categoryCollectionId: "BlogCategories"
      categoryFields:
        slug: "slug"
        title: "name"
        description: "description"
        image: "image"
    components:
      itemPage: true
      indexPage: true
      categoryPage: true
      cardWidget: true

  - collectionId: "Team"
    pathPrefix: "/team"
    fields:
      slug: "slug"
      title: "name"
      description: "bio"
      image: "photo"
      additionalFields: ["role", "email", "linkedin"]
    components:
      itemPage: true
      indexPage: true
      cardWidget: true
```

### Generic Contracts

#### data-item.jay-contract (Item Page)

```yaml
name: data-item
description: Generic data item page for any collection

tags:
  - {tag: _id, type: data, dataType: string, description: Item ID}
  - {tag: slug, type: data, dataType: string, description: URL slug}
  - {tag: title, type: data, dataType: string, required: true, description: Item title}
  - {tag: description, type: data, dataType: string, description: Main content/description}
  
  - tag: image
    type: sub-contract
    description: Main image
    tags:
      - {tag: url, type: data, dataType: string}
      - {tag: altText, type: data, dataType: string}
      - {tag: width, type: data, dataType: number}
      - {tag: height, type: data, dataType: number}
  
  # Dynamic fields array for additional configured fields
  - tag: fields
    type: sub-contract
    repeated: true
    trackBy: name
    description: Additional fields from configuration
    tags:
      - {tag: name, type: data, dataType: string, description: Field name}
      - {tag: value, type: data, dataType: string, description: Field value (stringified)}
      - {tag: type, type: variant, dataType: "enum (TEXT | NUMBER | DATE | BOOLEAN | RICH_TEXT | IMAGE | REFERENCE)", description: Field type}
      - {tag: label, type: data, dataType: string, description: Display label}
  
  # Embedded references
  - tag: references
    type: sub-contract
    repeated: true
    trackBy: fieldName
    description: Embedded reference data
    tags:
      - {tag: fieldName, type: data, dataType: string}
      - {tag: items, type: sub-contract, repeated: true, trackBy: _id}
        # Each item has dynamic fields based on config
  
  # SEO data
  - tag: seo
    type: sub-contract
    description: SEO metadata
    tags:
      - {tag: title, type: data, dataType: string}
      - {tag: description, type: data, dataType: string}
      - {tag: canonicalUrl, type: data, dataType: string}
```

#### data-list.jay-contract (Index/Category Page)

```yaml
name: data-list
description: List of items from a collection

tags:
  - tag: items
    type: sub-contract
    repeated: true
    trackBy: _id
    link: ./data-card
    description: Items in the list
  
  - {tag: totalCount, type: data, dataType: number, description: Total items in collection}
  - {tag: hasMore, type: variant, dataType: boolean, phase: fast+interactive, description: More items available}
  - {tag: isLoading, type: variant, dataType: boolean, phase: fast+interactive, description: Loading state}
  - {tag: loadMoreButton, type: interactive, elementType: HTMLButtonElement, description: Load more trigger}
  
  # For category pages
  - tag: category
    type: sub-contract
    description: Current category (for category pages)
    tags:
      - {tag: _id, type: data, dataType: string}
      - {tag: slug, type: data, dataType: string}
      - {tag: title, type: data, dataType: string}
      - {tag: description, type: data, dataType: string}
      - tag: image
        type: sub-contract
        tags:
          - {tag: url, type: data, dataType: string}
          - {tag: altText, type: data, dataType: string}
  
  # Breadcrumbs
  - tag: breadcrumbs
    type: sub-contract
    repeated: true
    trackBy: slug
    description: Navigation breadcrumbs
    tags:
      - {tag: slug, type: data, dataType: string}
      - {tag: title, type: data, dataType: string}
      - {tag: url, type: data, dataType: string}
```

#### data-card.jay-contract (Card Widget)

```yaml
name: data-card
description: Card representation of a data item

tags:
  - {tag: _id, type: data, dataType: string}
  - {tag: slug, type: data, dataType: string}
  - {tag: title, type: data, dataType: string, required: true}
  - {tag: description, type: data, dataType: string, description: Truncated description for preview}
  - {tag: url, type: data, dataType: string, description: Full URL to item page}
  - {tag: itemLink, type: interactive, elementType: HTMLAnchorElement}
  
  - tag: image
    type: sub-contract
    tags:
      - {tag: url, type: data, dataType: string}
      - {tag: altText, type: data, dataType: string}
  
  # Preview of key fields
  - tag: previewFields
    type: sub-contract
    repeated: true
    trackBy: name
    tags:
      - {tag: name, type: data, dataType: string}
      - {tag: value, type: data, dataType: string}
      - {tag: label, type: data, dataType: string}
```

#### data-table.jay-contract (Table Widget)

```yaml
name: data-table
description: Table view of collection items

tags:
  - tag: columns
    type: sub-contract
    repeated: true
    trackBy: fieldName
    description: Table column definitions
    tags:
      - {tag: fieldName, type: data, dataType: string}
      - {tag: label, type: data, dataType: string}
      - {tag: sortable, type: variant, dataType: boolean}
      - {tag: sortDirection, type: variant, dataType: "enum (NONE | ASC | DESC)", phase: fast+interactive}
      - {tag: headerButton, type: interactive, elementType: HTMLButtonElement}
  
  - tag: rows
    type: sub-contract
    repeated: true
    trackBy: _id
    description: Table rows
    tags:
      - {tag: _id, type: data, dataType: string}
      - {tag: url, type: data, dataType: string}
      - {tag: rowLink, type: interactive, elementType: HTMLAnchorElement}
      - tag: cells
        type: sub-contract
        repeated: true
        trackBy: fieldName
        tags:
          - {tag: fieldName, type: data, dataType: string}
          - {tag: value, type: data, dataType: string}
  
  - {tag: totalCount, type: data, dataType: number}
  - {tag: currentPage, type: data, dataType: number, phase: fast+interactive}
  - {tag: pageSize, type: data, dataType: number}
  - {tag: totalPages, type: data, dataType: number}
  - {tag: prevButton, type: interactive, elementType: HTMLButtonElement}
  - {tag: nextButton, type: interactive, elementType: HTMLButtonElement}
  - {tag: hasPrev, type: variant, dataType: boolean, phase: fast+interactive}
  - {tag: hasNext, type: variant, dataType: boolean, phase: fast+interactive}
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
  
  // Helper methods
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

### Component Factory Pattern

```typescript
// item-page.ts

import {
  makeJayStackComponent,
  PageProps,
  RenderPipeline,
  UrlParams
} from '@jay-framework/fullstack-component';
import { DataItemContract } from '../contracts/data-item.jay-contract';
import { WIX_DATA_SERVICE_MARKER, WixDataService } from '../services/wix-data-service';
import { CollectionConfig } from '../config/config-types';
import { mapItemToViewState } from '../utils/item-mapper';

export interface ItemPageParams extends UrlParams {
  slug: string;
}

/**
 * Factory function to create an item page component for a specific collection
 */
export function createItemPage(collectionConfig: CollectionConfig) {
  const { collectionId, fields } = collectionConfig;
  
  async function* loadItemParams(
    [wixData]: [WixDataService]
  ): AsyncIterable<ItemPageParams[]> {
    try {
      const result = await wixData.queryCollection(collectionId).find();
      yield result.items.map(item => ({ 
        slug: item.data?.[fields.slug] as string 
      }));
    } catch (error) {
      console.error(`Failed to load slugs for ${collectionId}:`, error);
      yield [];
    }
  }
  
  async function renderSlowlyChanging(
    props: PageProps & ItemPageParams,
    wixData: WixDataService
  ) {
    const Pipeline = RenderPipeline.for<DataItemSlowViewState, ItemCarryForward>();
    
    return Pipeline
      .try(async () => {
        const result = await wixData.queryCollection(collectionId)
          .eq(fields.slug, props.slug)
          .find();
        
        if (!result.items.length) {
          throw new Error('Item not found');
        }
        
        return result.items[0];
      })
      .recover(error => Pipeline.clientError(404, 'Item not found'))
      .toPhaseOutput(item => ({
        viewState: mapItemToViewState(item, collectionConfig),
        carryForward: { itemId: item._id }
      }));
  }
  
  return makeJayStackComponent<DataItemContract>()
    .withProps<PageProps>()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .withLoadParams(loadItemParams)
    .withSlowlyRender(renderSlowlyChanging);
}
```

### Plugin Registration Pattern

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

### Plugin YAML

```yaml
# plugin.yaml
name: wix-data

contracts:
  - name: data-item
    contract: data-item.jay-contract
    component: createItemPage
    description: Item page for a data collection item
    factory: true  # Indicates component is created via factory
    
  - name: data-list
    contract: data-list.jay-contract
    component: createIndexPage
    description: Index page listing all items in a collection
    factory: true
    
  - name: category-page
    contract: data-list.jay-contract
    component: createCategoryPage
    description: Category page showing items by reference
    factory: true
    
  - name: data-table
    contract: data-table.jay-contract
    component: createTableWidget
    description: Table widget for embedding item lists
    factory: true
    
  - name: data-card
    contract: data-card.jay-contract
    component: createCardWidget
    description: Card widget for embedding single items
    factory: true

actions:
  - queryItems
  - getItemBySlug
  - getCategories
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. Create package structure
2. Implement configuration types and loader
3. Implement schema reader (fetch Wix Data collection schemas)
4. Create service definition and registration

### Phase 2: Generic Contracts
1. Create `data-item.jay-contract`
2. Create `data-card.jay-contract`
3. Create `data-list.jay-contract`
4. Create `data-table.jay-contract`
5. Generate TypeScript definitions

### Phase 3: Item Page Component
1. Implement item mapper utility
2. Implement `createItemPage` factory
3. Implement slow/fast rendering phases
4. Add support for embedded references

### Phase 4: Index & Category Pages
1. Implement `createIndexPage` factory
2. Implement `createCategoryPage` factory
3. Add pagination support
4. Add interactive "load more" functionality

### Phase 5: Widgets
1. Implement `createTableWidget` factory
2. Implement `createCardWidget` factory
3. Add sorting for table widget
4. Add pagination for table widget

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
        contract="data-item"
        key="post"
        collection="BlogPosts"
></script>

<article>
  <h1>{post.title}</h1>
  <img src="{post.image.url}" alt="{post.image.altText}" />
  <div class="content">{post.description}</div>
  
  <aside class="meta">
    <span forEach="post.fields" trackBy="name">
      <strong>{label}:</strong> {value}
    </span>
  </aside>
</article>
```

### Table Widget

```html
<!-- admin/posts.jay-html -->
<script type="application/jay-headless"
        plugin="@jay-framework/wix-data"
        contract="data-table"
        key="postsTable"
        collection="BlogPosts"
        pageSize="20"
></script>

<table>
  <thead>
    <tr>
      <th forEach="postsTable.columns" trackBy="fieldName">
        <button ref="postsTable.columns.headerButton">
          {label}
          <span when="sortDirection" is="ASC">↑</span>
          <span when="sortDirection" is="DESC">↓</span>
        </button>
      </th>
    </tr>
  </thead>
  <tbody>
    <tr forEach="postsTable.rows" trackBy="_id">
      <td forEach="cells" trackBy="fieldName">{value}</td>
    </tr>
  </tbody>
</table>

<nav>
  <button ref="postsTable.prevButton" disabled="{!hasPrev}">Previous</button>
  <span>Page {currentPage} of {totalPages}</span>
  <button ref="postsTable.nextButton" disabled="{!hasNext}">Next</button>
</nav>
```

## Trade-offs

### Generic vs Typed Contracts
- **Chosen:** Generic contracts with dynamic `fields[]` array
- **Alternative:** Generate typed contracts per collection
- **Rationale:** Generic contracts are simpler to maintain and work across all collections. Type safety is provided through configuration validation.

### Factory vs Instance Components
- **Chosen:** Factory functions that create components per collection
- **Alternative:** Single component that reads collection from props
- **Rationale:** Factory pattern enables static generation of all item pages at build time. Props-based would require runtime configuration.

### Configuration File vs API Discovery
- **Chosen:** Explicit configuration file
- **Alternative:** Auto-discover all collections
- **Rationale:** Explicit config gives control over which collections to expose, field mappings, and URL structure. Auto-discovery would expose everything with less control.

### Multi-Reference Categories vs Separate Category Collection
- **Chosen:** Support both patterns via configuration
- **Rationale:** Wix Data supports both multi-reference fields and separate category collections. Configuration should support both common patterns.

## Verification Criteria

1. **Item Page Works:** Can navigate to `/blog/my-post` and see the blog post
2. **Index Page Works:** Can see list of all posts at `/blog`
3. **Category Page Works:** Can see posts in category at `/blog/category/tech`
4. **Table Widget Works:** Can embed sortable, paginated table in any page
5. **Card Widget Works:** Can embed single item card in any page
6. **Configuration Validated:** Invalid config produces clear error messages
7. **References Embedded:** Author reference is expanded in blog post view
8. **Load More Works:** Client-side pagination loads more items
9. **Sorting Works:** Table columns can be sorted
