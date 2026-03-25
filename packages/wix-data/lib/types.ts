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

    /**
     * Whether this collection is visible (generates contracts).
     * Default: false (hidden) - must be explicitly enabled.
     */
    visible?: boolean;

    /** URL path prefix (e.g., "/blog" for blog posts) */
    pathPrefix: string;

    /** Field to use as URL slug (required for routing) */
    slugField: string;

    /** Reference field configurations */
    references?: ReferenceConfig[];

    /** Category configuration (for category pages) */
    category?: CategoryConfig;

    /** Components to generate with optional field whitelists */
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

/**
 * Component configuration - either a boolean or an object with field whitelist.
 * - `true`: Generate component with all applicable fields
 * - `false` or omitted: Don't generate component
 * - `{ fields: [...] }`: Generate component with only whitelisted fields
 */
export type ComponentConfig =
    | boolean
    | {
          /** Whitelist of field keys to include. If omitted, all fields included. */
          fields?: string[];
      };

export interface ComponentsConfig {
    /** Generate item page component */
    itemPage?: ComponentConfig;

    /** Generate index page component (list all items) */
    indexPage?: ComponentConfig;

    /** Generate category page component (items by category) */
    categoryPage?: ComponentConfig;

    /** Generate table widget component */
    tableWidget?: ComponentConfig;

    /** Generate card widget component */
    cardWidget?: ComponentConfig;
}

/**
 * Get field whitelist for a component configuration.
 * @returns Array of field keys if whitelist specified, undefined if all fields should be included
 */
export function getComponentFields(config: ComponentConfig | undefined): string[] | undefined {
    if (config === undefined || config === false) return undefined;
    if (config === true) return undefined; // all fields
    return config.fields;
}

/**
 * Check if a component is enabled (true or object with config)
 */
export function isComponentEnabled(config: ComponentConfig | undefined): boolean {
    if (config === undefined || config === false) return false;
    return true;
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
