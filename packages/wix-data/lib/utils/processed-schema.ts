/**
 * Processed Schema
 * 
 * Intermediate representation of a collection schema with processed fields.
 * Created once from Wix Data API response and reused by all contract generators.
 */

import { DataCollection, Field } from '@wix/auto_sdk_data_collections';
import { CollectionConfig, ReferenceConfig } from '../types';

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
    
    /** 
     * For embedded references: the processed schema of the referenced collection.
     * Enables generating full sub-contracts from the referenced collection's fields.
     */
    embeddedSchema?: ProcessedSchema;
    
    /** Reference configuration (for embedded refs, includes nested references) */
    referenceConfig?: ReferenceConfig;
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
 * Collection fetcher function type - used for fetching referenced collections
 */
export type CollectionFetcher = (collectionId: string) => Promise<DataCollection | null>;

/**
 * Extract the referenced collection ID from a field's type metadata
 */
function getReferencedCollectionId(field: Field): string | undefined {
    const metadata = field.typeMetadata;
    if (!metadata) return undefined;
    
    if (field.type === 'REFERENCE') {
        return metadata.reference?.referencedCollectionId;
    }
    if (field.type === 'MULTI_REFERENCE') {
        return metadata.multiReference?.referencedCollectionId;
    }
    return undefined;
}

/**
 * Process a DataCollection from Wix Data API into our intermediate representation.
 * 
 * @param collection - DataCollection from Wix Data API
 * @param config - Collection configuration
 * @param collectionFetcher - Optional function to fetch collections for embedded references
 */
export async function processSchema(
    collection: DataCollection,
    config: CollectionConfig,
    collectionFetcher?: CollectionFetcher
): Promise<ProcessedSchema> {
    // Build a map of field name -> reference config for quick lookup
    const refConfigMap = new Map(
        (config.references || []).map(r => [r.fieldName, r])
    );
    
    // Process all fields
    const fields: ProcessedField[] = await Promise.all(
        (collection.fields || []).map(async (f: Field) => {
            const key = f.key || '';
            const wixType = f.type || 'TEXT';
            const category = getFieldCategory(key, wixType);
            
            const refConfig = refConfigMap.get(key);
            const isEmbedded = (category === 'reference' || category === 'multiReference') 
                && refConfig?.mode === 'embed';
            
            const field: ProcessedField = {
                key,
                displayName: f.displayName,
                jayType: mapWixTypeToJayType(wixType),
                wixType,
                category,
                embedded: isEmbedded,
                referenceConfig: isEmbedded ? refConfig : undefined
            };
            
            // If embedded and we have a collection fetcher, fetch and process the referenced schema
            if (isEmbedded && collectionFetcher && refConfig) {
                const referencedCollectionId = getReferencedCollectionId(f);
                
                if (referencedCollectionId) {
                    const referencedCollection = await collectionFetcher(referencedCollectionId);
                    if (referencedCollection) {
                        // Create a minimal config for the referenced collection
                        const nestedConfig: CollectionConfig = {
                            collectionId: referencedCollection._id || referencedCollectionId,
                            pathPrefix: '',
                            slugField: '',
                            references: refConfig.references, // Pass nested references
                            components: {}
                        };
                        
                        // Recursively process the referenced collection
                        field.embeddedSchema = await processSchema(referencedCollection, nestedConfig, collectionFetcher);
                    }
                }
            }
            
            return field;
        })
    );
    
    return {
        collectionId: collection._id || config.collectionId,
        displayName: collection.displayName,
        config,
        fields,
        hasCategory: !!config.category,
        category: config.category
    };
}
