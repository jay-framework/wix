# Design Log #09 - Wix Data List Field Mapping

## Background

The wix-data plugin generates contracts and components for Wix Data collections. The `collection-list.ts` component renders list pages (index and category pages) with items from a collection.

Currently:
1. The list contract generator includes ALL non-system, non-reference, non-richContent fields in the contract
2. The component's `transformDataFields` function spreads all data fields into the view state without specific mapping
3. There's no way to configure which fields appear in list views vs item detail pages

## Problem

The materialized contract `list-recipes-list.jay-contract` includes too many fields:

```yaml
# Current: ALL fields included
- {tag: title, type: data, dataType: string}
- {tag: servings, type: data, dataType: string}
- {tag: description, type: data, dataType: string}
- {tag: shortDescription, type: data, dataType: string}
- {tag: preparationTime, type: data, dataType: string}
- {tag: order, type: data, dataType: number}
- {tag: link-recipes-title, type: data, dataType: string}
- {tag: link-recipes-all, type: data, dataType: string}
- tag: image ...
- tag: ImageBanner ...
```

For a list page, we typically only need:
- Title (for display)
- URL/slug (for linking)
- One image (for thumbnail)
- Maybe 1-2 preview fields (e.g., short description)

## Questions and Answers

**Q1: Should we require explicit configuration or provide smart defaults?**

A: Both. Provide sensible defaults that work out-of-the-box, but allow override via `wix-data.yaml`.

**Q2: What should the default field mapping be?**

A: Priority-based detection:
- `title`: Field named "title", "name", or first TEXT field marked as display field
- `url`: Auto-generated from pathPrefix + slugField (already done)
- `image`: First IMAGE field in the schema
- `description`: Field named "shortDescription", "description", or "summary" (first match)

**Q3: Should the mapping be for contract generation only or also used at runtime?**

A: Both. The contract generator uses it to determine which tags to include. The component uses the same mapping to extract data from Wix Data API responses and map to the view state.

**Q4: How do we handle the case where a collection doesn't have expected fields?**

A: Skip missing fields - the contract won't include tags for fields that don't exist.

## Design

### 1. Configuration Schema Extension

Add `listFields` to `CollectionConfig` in `types.ts`:

```typescript
export interface ListFieldsConfig {
    /** Field to use as title. Default: auto-detect "title" or "name" */
    title?: string;
    
    /** Field to use as image thumbnail. Default: first IMAGE field */
    image?: string;
    
    /** Field to use as description/excerpt. Default: "shortDescription" or "description" */
    description?: string;
    
    /** Additional fields to include in list view */
    additional?: string[];
}

export interface CollectionConfig {
    // ... existing fields ...
    
    /** 
     * Field mapping for list/card views.
     * If not specified, smart defaults are used.
     */
    listFields?: ListFieldsConfig;
}
```

### 2. YAML Configuration Example

```yaml
collections:
  - collectionId: Recipes
    visible: true
    pathPrefix: /recipes
    slugField: title
    components:
      itemPage: true
      indexPage: true
    listFields:
      title: title
      image: image
      description: shortDescription
      # No 'additional' - keep it minimal
```

### 3. Default Field Detection

Add to `processed-schema.ts`:

```typescript
export interface ListFieldMapping {
    titleField?: string;
    imageField?: string;
    descriptionField?: string;
    additionalFields: string[];
}

export function resolveListFieldMapping(
    schema: ProcessedSchema,
    config?: ListFieldsConfig
): ListFieldMapping {
    const fields = schema.fields;
    
    // Title: explicit > "title" > "name" > first simple text field
    const titleField = config?.title 
        || findField(fields, 'title')
        || findField(fields, 'name')
        || fields.find(f => f.category === 'simple' && f.jayType === 'string')?.key;
    
    // Image: explicit > first image field
    const imageField = config?.image
        || fields.find(f => f.category === 'image')?.key;
    
    // Description: explicit > "shortDescription" > "description" > "summary"
    const descriptionField = config?.description
        || findField(fields, 'shortDescription')
        || findField(fields, 'description')
        || findField(fields, 'summary');
    
    return {
        titleField,
        imageField,
        descriptionField,
        additionalFields: config?.additional || []
    };
}
```

### 4. Contract Generator Update

Update `list-contract-generator.ts` to use the mapping:

```typescript
function buildCardTags(schema: ProcessedSchema, indent = 6): string[] {
    const mapping = resolveListFieldMapping(schema, schema.config.listFields);
    const cardTags: string[] = [
        dataTag('_id', 'string', undefined, indent),
        dataTag('url', 'string', 'Full URL to item page', indent),
        interactiveTag('itemLink', 'HTMLAnchorElement', undefined, indent)
    ];
    
    // Add mapped fields
    if (mapping.titleField) {
        const field = schema.fields.find(f => f.key === mapping.titleField);
        if (field) cardTags.push(dataTag('title', field.jayType, 'Title', indent));
    }
    
    if (mapping.imageField) {
        cardTags.push(imageSubContract('image', 'Thumbnail', indent));
    }
    
    if (mapping.descriptionField) {
        cardTags.push(dataTag('description', 'string', 'Description', indent));
    }
    
    // Add any additional fields
    mapping.additionalFields.forEach(fieldKey => {
        const field = schema.fields.find(f => f.key === fieldKey);
        if (field) {
            const tag = fieldToTag(field, indent);
            if (tag) cardTags.push(tag);
        }
    });
    
    return cardTags;
}
```

### 5. Component Mapping Update

Update `collection-list.ts` to map using the same config.

**Important**: Wix image URLs come in a special protocol format:
```
wix:image://v1/0e4eed_92220e22e7604162a3f16d11a765c00e~mv2.jpg/Devanco-June-2021-001.jpg#originWidth=6484&originHeight=4115
```

These must be transformed to public URLs using `formatWixMediaUrl` from `@jay-framework/wix-utils`:
```
https://static.wixstatic.com/media/0e4eed_92220e22e7604162a3f16d11a765c00e~mv2.jpg
```

```typescript
import { formatWixMediaUrl, parseWixMediaUrl } from '@jay-framework/wix-utils';

interface MappedListItem {
    _id: string;
    url: string;
    title?: string;
    image?: { url: string; altText: string; width?: number; height?: number };
    description?: string;
    [key: string]: unknown; // additional fields
}

/**
 * Transform a Wix image field value to view state format.
 * Handles wix:image:// protocol URLs and extracts dimensions.
 */
function mapImageField(imgValue: unknown): MappedListItem['image'] | undefined {
    if (!imgValue) return undefined;
    
    // Handle string URL (wix:image:// or http(s)://)
    if (typeof imgValue === 'string') {
        const parsed = parseWixMediaUrl(imgValue);
        return {
            url: formatWixMediaUrl('', imgValue),
            altText: '',
            width: parsed?.originWidth,
            height: parsed?.originHeight
        };
    }
    
    // Handle object with src/url property
    if (typeof imgValue === 'object' && imgValue !== null) {
        const img = imgValue as Record<string, unknown>;
        const srcUrl = (img.src || img.url || '') as string;
        const parsed = parseWixMediaUrl(srcUrl);
        
        return {
            url: formatWixMediaUrl('', srcUrl),
            altText: (img.alt as string) || '',
            width: parsed?.originWidth ?? (img.width as number),
            height: parsed?.originHeight ?? (img.height as number)
        };
    }
    
    return undefined;
}

function mapItemToViewState(
    item: any,
    pathPrefix: string,
    slugField: string,
    mapping: ListFieldMapping
): MappedListItem {
    const data = item.data || {};
    
    const mapped: MappedListItem = {
        _id: item._id!,
        url: `${pathPrefix}/${data[slugField] || item._id}`
    };
    
    // Map title first (needed for image alt fallback)
    if (mapping.titleField && data[mapping.titleField] != null) {
        mapped.title = String(data[mapping.titleField]);
    }
    
    // Map image (with wix:// URL transformation, use title as alt fallback)
    if (mapping.imageField) {
        mapped.image = mapImageField(data[mapping.imageField]);
        if (mapped.image && !mapped.image.altText && mapped.title) {
            mapped.image.altText = mapped.title;
        }
    }
    
    // Map description
    if (mapping.descriptionField && data[mapping.descriptionField] != null) {
        mapped.description = String(data[mapping.descriptionField]);
    }
    
    // Map additional fields
    mapping.additionalFields.forEach(key => {
        if (data[key] != null) {
            mapped[key] = data[key];
        }
    });
    
    return mapped;
}
```

### 6. Carry Forward the Mapping

The mapping needs to be available in both slow and fast phases. Options:
- **Option A**: Include mapping in carryForward (serialize it)
- **Option B**: Re-resolve mapping from config in each phase

Going with **Option A** - include in carryForward for consistency and efficiency.

## Implementation Plan

### Phase 1: Types and Config Parsing
1. Add `ListFieldsConfig` to `types.ts`
2. Update YAML parsing in `config-loader.ts` to handle `listFields`

### Phase 2: Field Resolution
1. Add `ListFieldMapping` interface to `processed-schema.ts`
2. Implement `resolveListFieldMapping()` function
3. Add mapping to `ProcessedSchema` output

### Phase 3: Contract Generator
1. Update `buildCardTags()` in `list-contract-generator.ts` to use mapping
2. Remove `isCardField` filter (no longer needed - we use explicit mapping)

### Phase 4: Component Mapping
1. Add `ListFieldMapping` to `ListSlowCarryForward` and `ListFastCarryForward`
2. Import `formatWixMediaUrl`, `parseWixMediaUrl` from `@jay-framework/wix-utils`
3. Create `mapImageField()` helper for wix:// URL transformation
4. Create `mapItemToViewState()` helper
5. Update `renderSlowlyChanging()` to use mapping
6. Update `ListInteractive` to use mapping for loaded items

### Phase 5: Test and Update Examples
1. Update `wix-data.yaml` with `listFields` for Recipes collection
2. Regenerate contracts
3. Verify reduced contract size
4. Test list page rendering

## Expected Result

Contract changes from:

```yaml
# Before: 12+ fields per item
- {tag: title, ...}
- {tag: servings, ...}
- {tag: description, ...}
- {tag: shortDescription, ...}
- {tag: preparationTime, ...}
- {tag: order, ...}
- {tag: link-recipes-title, ...}
- {tag: link-recipes-all, ...}
- tag: image (sub-contract)
- tag: ImageBanner (sub-contract)
```

To:

```yaml
# After: 4 core fields
- {tag: _id, ...}
- {tag: url, ...}
- {tag: itemLink, ...}
- {tag: title, ...}
- tag: image (sub-contract)
- {tag: description, ...}
```

## Trade-offs

| Decision | Trade-off |
|----------|-----------|
| Smart defaults | Magic behavior - may not always pick the right field |
| Normalized output (always `title`, `image`, `description`) | Original field names lost - but consistent template authoring |
| Config in `wix-data.yaml` | Requires regeneration if changed |
| Mapping in carryForward | Larger serialized state, but consistent behavior |

## Verification Criteria

1. ✅ Recipes list contract only has 4-5 fields per item (was 12+)
2. ✅ Default detection works for collections without explicit `listFields`
3. ✅ Explicit `listFields` config overrides defaults
4. ✅ `additional` fields appear in contract and view state
5. ✅ Image URLs transformed from `wix:image://` to `https://static.wixstatic.com/media/`
6. ✅ Image dimensions extracted from URL hash params (`originWidth`, `originHeight`)
7. ✅ List page renders correctly with mapped data
