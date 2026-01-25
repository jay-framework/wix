/**
 * Schema to Contract Converter
 * 
 * Converts Wix Data collection schemas to Jay contract YAML format.
 */

import { CollectionSchema, FieldSchema, WixDataFieldType, ReferenceConfig } from '../config/config-types';

/**
 * Options for contract generation
 */
export interface ContractGenerationOptions {
    /** Type of contract to generate */
    type: 'item' | 'list' | 'table' | 'card';
    
    /** Reference fields to embed (fetch full data) */
    embedReferences?: ReferenceConfig[];
    
    /** Whether to include pagination controls */
    includePagination?: boolean;
    
    /** Whether to include category section (for category pages) */
    includeCategory?: boolean;
}

/**
 * Convert a Wix Data collection schema to Jay contract YAML
 * 
 * @param schema - Collection schema from Wix Data API
 * @param options - Generation options
 * @returns Contract definition as YAML string
 */
export function schemaToContractYaml(
    schema: CollectionSchema,
    options: ContractGenerationOptions
): string {
    const tags: string[] = [];
    const { type, embedReferences = [] } = options;
    
    // Build contract based on type
    switch (type) {
        case 'item':
            return generateItemContract(schema, embedReferences);
        case 'list':
            return generateListContract(schema, options);
        case 'table':
            return generateTableContract(schema);
        case 'card':
            return generateCardContract(schema);
    }
}

/**
 * Generate an item page contract
 */
function generateItemContract(
    schema: CollectionSchema,
    embedReferences: ReferenceConfig[]
): string {
    const tags: string[] = [];
    
    // Always include _id and itemLink
    tags.push('  - {tag: _id, type: data, dataType: string, description: Item ID}');
    tags.push('  - {tag: itemLink, type: interactive, elementType: HTMLAnchorElement, description: Link to item}');
    
    // Map each field from schema
    schema.fields
        .flatMap(field => fieldToTags(field, embedReferences))
        .forEach(tag => tags.push(tag));
    
    return `name: ${schema._id}Item
description: Item page for ${schema.displayName || schema._id} collection
tags:
${tags.join('\n')}`;
}

/**
 * Generate a list page contract (for index and category pages)
 */
function generateListContract(
    schema: CollectionSchema,
    options: ContractGenerationOptions
): string {
    const tags: string[] = [];
    
    // Items array using card contract
    tags.push(`  - tag: items
    type: sub-contract
    repeated: true
    trackBy: _id
    description: Items in the list
    tags:
${generateCardTags(schema, 6)}`);
    
    // Pagination controls
    tags.push('  - {tag: totalCount, type: data, dataType: number, description: Total items in collection}');
    tags.push('  - {tag: hasMore, type: variant, dataType: boolean, phase: fast+interactive, description: More items available}');
    tags.push('  - {tag: isLoading, type: variant, dataType: boolean, phase: fast+interactive, description: Loading state}');
    tags.push('  - {tag: loadMoreButton, type: interactive, elementType: HTMLButtonElement, description: Load more trigger}');
    
    // Category section if included
    if (options.includeCategory) {
        tags.push(`  - tag: category
    type: sub-contract
    description: Current category
    tags:
      - {tag: _id, type: data, dataType: string}
      - {tag: slug, type: data, dataType: string}
      - {tag: title, type: data, dataType: string}
      - {tag: description, type: data, dataType: string}`);
    }
    
    // Breadcrumbs
    tags.push(`  - tag: breadcrumbs
    type: sub-contract
    repeated: true
    trackBy: slug
    description: Navigation breadcrumbs
    tags:
      - {tag: slug, type: data, dataType: string}
      - {tag: title, type: data, dataType: string}
      - {tag: url, type: data, dataType: string}`);
    
    return `name: ${schema._id}List
description: List page for ${schema.displayName || schema._id} collection
tags:
${tags.join('\n')}`;
}

/**
 * Generate a table widget contract
 */
function generateTableContract(schema: CollectionSchema): string {
    const tags: string[] = [];
    
    // Column definitions
    tags.push(`  - tag: columns
    type: sub-contract
    repeated: true
    trackBy: fieldName
    description: Table column definitions
    tags:
      - {tag: fieldName, type: data, dataType: string}
      - {tag: label, type: data, dataType: string}
      - {tag: sortable, type: variant, dataType: boolean}
      - {tag: sortDirection, type: variant, dataType: "enum (NONE | ASC | DESC)", phase: fast+interactive}
      - {tag: headerButton, type: interactive, elementType: HTMLButtonElement}`);
    
    // Rows with cells
    tags.push(`  - tag: rows
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
          - {tag: value, type: data, dataType: string}`);
    
    // Pagination
    tags.push('  - {tag: totalCount, type: data, dataType: number}');
    tags.push('  - {tag: currentPage, type: data, dataType: number, phase: fast+interactive}');
    tags.push('  - {tag: pageSize, type: data, dataType: number}');
    tags.push('  - {tag: totalPages, type: data, dataType: number}');
    tags.push('  - {tag: prevButton, type: interactive, elementType: HTMLButtonElement}');
    tags.push('  - {tag: nextButton, type: interactive, elementType: HTMLButtonElement}');
    tags.push('  - {tag: hasPrev, type: variant, dataType: boolean, phase: fast+interactive}');
    tags.push('  - {tag: hasNext, type: variant, dataType: boolean, phase: fast+interactive}');
    
    return `name: ${schema._id}Table
description: Table widget for ${schema.displayName || schema._id} collection
tags:
${tags.join('\n')}`;
}

/**
 * Generate a card widget contract
 */
function generateCardContract(schema: CollectionSchema): string {
    const tags = generateCardTags(schema, 2);
    
    return `name: ${schema._id}Card
description: Card widget for ${schema.displayName || schema._id} collection
tags:
${tags}`;
}

/**
 * Generate tags for a card (used by both card and list contracts)
 */
function generateCardTags(schema: CollectionSchema, indent: number): string {
    const prefix = ' '.repeat(indent);
    const tags: string[] = [];
    
    tags.push(`${prefix}- {tag: _id, type: data, dataType: string}`);
    tags.push(`${prefix}- {tag: url, type: data, dataType: string, description: Full URL to item page}`);
    tags.push(`${prefix}- {tag: itemLink, type: interactive, elementType: HTMLAnchorElement}`);
    
    // Add simplified fields for card display (skip system, reference, and rich text fields)
    const cardFields = schema.fields
        .filter(field => !field.key.startsWith('_'))
        .filter(field => field.type !== 'REFERENCE' && field.type !== 'MULTI_REFERENCE')
        .filter(field => field.type !== 'RICH_TEXT' && field.type !== 'RICH_CONTENT');
    
    cardFields.forEach(field => {
        if (field.type === 'IMAGE') {
            tags.push(`${prefix}- tag: ${field.key}
${prefix}  type: sub-contract
${prefix}  tags:
${prefix}    - {tag: url, type: data, dataType: string}
${prefix}    - {tag: altText, type: data, dataType: string}`);
        } else {
            const dataType = mapWixTypeToJayType(field.type);
            tags.push(`${prefix}- {tag: ${field.key}, type: data, dataType: ${dataType}}`);
        }
    });
    
    return tags.join('\n');
}

/**
 * Convert a single field to contract tags
 */
function fieldToTags(
    field: FieldSchema,
    embedReferences: ReferenceConfig[]
): string[] {
    const { key, type, displayName } = field;
    const tags: string[] = [];
    
    // Skip system fields except _id
    if (key.startsWith('_') && key !== '_id') return [];
    
    // Check if this is an embedded reference
    const isEmbedded = embedReferences.some(r => r.fieldName === key);
    
    if (type === 'REFERENCE') {
        if (isEmbedded) {
            tags.push(`  - tag: ${key}
    type: sub-contract
    description: Embedded ${displayName || key} reference
    tags:
      - {tag: _id, type: data, dataType: string}
      - {tag: data, type: data, dataType: string, description: Referenced item data (JSON)}`);
        } else {
            tags.push(`  - {tag: ${key}, type: data, dataType: string, description: Reference ID}`);
        }
    } else if (type === 'MULTI_REFERENCE') {
        if (isEmbedded) {
            tags.push(`  - tag: ${key}
    type: sub-contract
    repeated: true
    trackBy: _id
    description: Embedded ${displayName || key} references
    tags:
      - {tag: _id, type: data, dataType: string}
      - {tag: data, type: data, dataType: string, description: Referenced item data (JSON)}`);
        } else {
            tags.push(`  - {tag: ${key}, type: data, dataType: string, description: Reference IDs (JSON array)}`);
        }
    } else if (type === 'IMAGE') {
        tags.push(`  - tag: ${key}
    type: sub-contract
    description: ${displayName || key} image
    tags:
      - {tag: url, type: data, dataType: string}
      - {tag: altText, type: data, dataType: string}
      - {tag: width, type: data, dataType: number}
      - {tag: height, type: data, dataType: number}`);
    } else if (type === 'VIDEO' || type === 'AUDIO') {
        tags.push(`  - tag: ${key}
    type: sub-contract
    description: ${displayName || key} media
    tags:
      - {tag: url, type: data, dataType: string}
      - {tag: title, type: data, dataType: string}`);
    } else if (type === 'ADDRESS') {
        tags.push(`  - tag: ${key}
    type: sub-contract
    description: ${displayName || key} address
    tags:
      - {tag: formatted, type: data, dataType: string}
      - {tag: city, type: data, dataType: string}
      - {tag: country, type: data, dataType: string}`);
    } else {
        const dataType = mapWixTypeToJayType(type);
        const desc = displayName ? `, description: ${displayName}` : '';
        tags.push(`  - {tag: ${key}, type: data, dataType: ${dataType}${desc}}`);
    }
    
    return tags;
}

/**
 * Map Wix Data field types to Jay contract data types
 */
function mapWixTypeToJayType(wixType: WixDataFieldType): string {
    const typeMap: Record<string, string> = {
        'TEXT': 'string',
        'NUMBER': 'number',
        'BOOLEAN': 'boolean',
        'DATE': 'string',
        'DATETIME': 'string',
        'TIME': 'string',
        'RICH_TEXT': 'string',
        'RICH_CONTENT': 'string',
        'URL': 'string',
        'DOCUMENT': 'string',
        'ARRAY': 'string',
        'OBJECT': 'string',
        'TAGS': 'string',
    };
    return typeMap[wixType] || 'string';
}

/**
 * Convert collection ID to PascalCase for contract names
 */
export function toPascalCase(str: string): string {
    return str
        .split(/[-_\s]+/)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        .join('');
}
