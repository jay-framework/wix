/**
 * Processed Schema
 * 
 * Intermediate representation of a collection schema with processed fields.
 * Created once from Wix Data API response and reused by all contract generators.
 */

import { CollectionConfig, ReferenceConfig } from '../config/config-types';

/**
 * Processed field with normalized types
 */
export interface ProcessedField {
    key: string;
    displayName?: string;
    jayType: string;
    wixType: string;
    
    /** Field category for filtering */
    category: 'simple' | 'image' | 'media' | 'address' | 'reference' | 'multiReference' | 'richContent' | 'system';
    
    /** Whether this reference should be embedded (full data fetched) */
    embedded?: boolean;
}

/**
 * Processed schema ready for contract generation
 */
export interface ProcessedSchema {
    collectionId: string;
    displayName?: string;
    config: CollectionConfig;
    
    /** All fields with processed metadata */
    fields: ProcessedField[];
    
    /** Fields suitable for card/list display (excludes system, references, rich content) */
    cardFields: ProcessedField[];
    
    /** Fields suitable for table display (excludes complex types) */
    tableFields: ProcessedField[];
    
    /** Reference fields (both single and multi) */
    referenceFields: ProcessedField[];
    
    /** Embedded reference fields */
    embeddedReferences: ProcessedField[];
    
    /** Whether this collection has category support */
    hasCategory: boolean;
    
    /** Category configuration if present */
    category?: {
        referenceField: string;
        categorySlugField: string;
    };
}

/**
 * Map Wix Data field types to Jay contract data types
 */
function mapWixTypeToJayType(wixType: string): string {
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
 * Determine field category from Wix type
 */
function getFieldCategory(key: string, wixType: string): ProcessedField['category'] {
    if (key.startsWith('_')) return 'system';
    
    switch (wixType) {
        case 'IMAGE': return 'image';
        case 'VIDEO':
        case 'AUDIO': return 'media';
        case 'ADDRESS': return 'address';
        case 'REFERENCE': return 'reference';
        case 'MULTI_REFERENCE': return 'multiReference';
        case 'RICH_TEXT':
        case 'RICH_CONTENT': return 'richContent';
        default: return 'simple';
    }
}

/**
 * Process a raw schema from Wix Data API into our intermediate representation
 */
export function processSchema(
    rawSchema: { _id?: string; displayName?: string; fields?: Array<{ key?: string; displayName?: string; type?: string }> },
    config: CollectionConfig
): ProcessedSchema {
    const embedRefs = new Set(
        (config.references || [])
            .filter(r => r.mode === 'embed')
            .map(r => r.fieldName)
    );
    
    // Process all fields
    const fields: ProcessedField[] = (rawSchema.fields || []).map(f => {
        const key = f.key || '';
        const wixType = f.type || 'TEXT';
        const category = getFieldCategory(key, wixType);
        
        return {
            key,
            displayName: f.displayName,
            jayType: mapWixTypeToJayType(wixType),
            wixType,
            category,
            embedded: (category === 'reference' || category === 'multiReference') && embedRefs.has(key)
        };
    });
    
    // Derive filtered field sets
    const cardFields = fields.filter(f => 
        f.category !== 'system' && 
        f.category !== 'reference' && 
        f.category !== 'multiReference' && 
        f.category !== 'richContent'
    );
    
    const tableFields = fields.filter(f =>
        f.category === 'simple'
    );
    
    const referenceFields = fields.filter(f =>
        f.category === 'reference' || f.category === 'multiReference'
    );
    
    const embeddedReferences = referenceFields.filter(f => f.embedded);
    
    return {
        collectionId: rawSchema._id || config.collectionId,
        displayName: rawSchema.displayName,
        config,
        fields,
        cardFields,
        tableFields,
        referenceFields,
        embeddedReferences,
        hasCategory: !!config.category,
        category: config.category
    };
}
