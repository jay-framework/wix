/**
 * Wix Data Plugin Configuration Types
 * 
 * Defines the structure for wix-data.config.yaml
 */

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
    /** Reference field name in the collection */
    fieldName: string;
    
    /** 
     * How to handle the reference:
     * - 'embed': Fetch referenced item(s) and include full data
     * - 'link': Include only the reference ID (default)
     */
    mode: 'embed' | 'link';
    
    /** 
     * Nested reference configurations for multi-level embeds.
     * Only applicable when mode is 'embed'.
     * Allows embedding references within the referenced collection.
     */
    references?: ReferenceConfig[];
}

export interface CategoryConfig {
    /** Multi-reference field that links to category collection */
    referenceField: string;
    
    /** Field in category collection to use as slug for URLs */
    categorySlugField: string;
}

export interface ComponentsConfig {
    /** Generate item page component */
    itemPage?: boolean;
    
    /** Generate index page component (list all items) */
    indexPage?: boolean;
    
    /** Generate category page component (items by category) */
    categoryPage?: boolean;
    
    /** Generate table widget component */
    tableWidget?: boolean;
    
    /** Generate card widget component */
    cardWidget?: boolean;
}

/**
 * Validated configuration with collection schemas loaded
 */
export interface ResolvedWixDataConfig extends WixDataConfig {
    /** Collection schemas fetched from Wix Data API */
    schemas: Map<string, CollectionSchema>;
}

/**
 * Collection schema from Wix Data API
 */
export interface CollectionSchema {
    _id: string;
    displayName?: string;
    fields: FieldSchema[];
}

/**
 * Field schema from Wix Data API
 */
export interface FieldSchema {
    key: string;
    displayName?: string;
    type: WixDataFieldType;
    required?: boolean;
}

/**
 * Wix Data field types
 * @see https://dev.wix.com/docs/sdk/backend-modules/data/collections/data-types-in-wix-data
 */
export type WixDataFieldType =
    | 'TEXT'
    | 'NUMBER'
    | 'BOOLEAN'
    | 'DATE'
    | 'DATETIME'
    | 'TIME'
    | 'RICH_TEXT'
    | 'URL'
    | 'IMAGE'
    | 'VIDEO'
    | 'AUDIO'
    | 'DOCUMENT'
    | 'REFERENCE'
    | 'MULTI_REFERENCE'
    | 'ARRAY'
    | 'OBJECT'
    | 'TAGS'
    | 'ADDRESS'
    | 'RICH_CONTENT';
