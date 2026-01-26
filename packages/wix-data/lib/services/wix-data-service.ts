/**
 * Server-side Wix Data Service
 * 
 * Provides access to Wix Data APIs on the server using API Key authentication.
 * Manages schema caching to avoid duplicate API calls.
 */

import { WixClient } from '@wix/sdk';
import { items, collections } from '@wix/data';
import { DataCollection } from '@wix/auto_sdk_data_collections';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { WixDataConfig, CollectionConfig } from '../types';
import { ProcessedSchema, processSchema } from '../utils/processed-schema';

type ItemsClient = typeof items;
type CollectionsClient = typeof collections;

/**
 * Wix Data Service interface
 * 
 * Provides access to Wix Data APIs, configuration, and cached schemas.
 */
export interface WixDataService {
    /** Wix Data Items API client */
    items: ItemsClient;
    
    /** Wix Data Collections API client */
    collections: CollectionsClient;
    
    /** Plugin configuration */
    config: WixDataConfig;
    
    /**
     * Get configuration for a specific collection
     */
    getCollectionConfig(collectionId: string): CollectionConfig | undefined;
    
    /**
     * Get DataCollection from Wix API (cached)
     */
    getCollection(collectionId: string): Promise<DataCollection | null>;
    
    /**
     * Get processed schema for a collection (cached)
     * Returns null if collection not found
     */
    getProcessedSchema(collectionId: string): Promise<ProcessedSchema | null>;
    
    /**
     * Get all processed schemas for collections matching a filter
     */
    getProcessedSchemas(filter: (config: CollectionConfig) => boolean): Promise<ProcessedSchema[]>;
}

/**
 * Server service marker for Wix Data.
 * Use with `.withServices(WIX_DATA_SERVICE_MARKER)` in component definitions.
 */
export const WIX_DATA_SERVICE_MARKER = createJayService<WixDataService>('Wix Data Service');

// Singleton instances
let itemsClientInstance: ItemsClient;
let collectionsClientInstance: CollectionsClient | undefined;

/**
 * Get Items client singleton
 */
function getItemsClient(wixClient: WixClient): ItemsClient {
    if (!itemsClientInstance) {
        itemsClientInstance = wixClient.use(items) as unknown as ItemsClient;
    }
    return itemsClientInstance;
}

/**
 * Get Collections client singleton
 */
function getCollectionsClient(wixClient: WixClient): CollectionsClient {
    if (!collectionsClientInstance) {
        collectionsClientInstance = wixClient.use(collections) as unknown as CollectionsClient;
    }
    return collectionsClientInstance;
}

/**
 * Creates, registers, and returns a Wix Data service instance.
 * Called during server initialization.
 * 
 * @param wixClient - Authenticated Wix SDK client
 * @param config - Plugin configuration
 */
export function provideWixDataService(
    wixClient: WixClient,
    config: WixDataConfig
): WixDataService {
    const itemsClient: ItemsClient = getItemsClient(wixClient);
    const collectionsClient: CollectionsClient = getCollectionsClient(wixClient);
    
    // Collection cache: collectionId -> DataCollection
    const collectionCache = new Map<string, DataCollection | null>();
    
    // Processed schema cache: collectionId -> ProcessedSchema
    const processedSchemaCache = new Map<string, ProcessedSchema | null>();
    
    /**
     * Fetch DataCollection from Wix Data API (with caching)
     */
    async function fetchCollection(collectionId: string): Promise<DataCollection | null> {
        if (collectionCache.has(collectionId)) {
            return collectionCache.get(collectionId) || null;
        }
        
        try {
            const collection: DataCollection = await collectionsClient.getDataCollection(collectionId);
            
            if (!collection) {
                collectionCache.set(collectionId, null);
                return null;
            }
            
            collectionCache.set(collectionId, collection);
            return collection;
            
        } catch (error) {
            console.error(`[wix-data] Failed to fetch collection ${collectionId}:`, error);
            collectionCache.set(collectionId, null);
            return null;
        }
    }
    
    const service: WixDataService = {
        items: itemsClient,
        collections: collectionsClient,
        config,
        
        getCollectionConfig(collectionId: string): CollectionConfig | undefined {
            return config.collections.find(c => c.collectionId === collectionId);
        },
        
        async getCollection(collectionId: string): Promise<DataCollection | null> {
            return fetchCollection(collectionId);
        },
        
        async getProcessedSchema(collectionId: string): Promise<ProcessedSchema | null> {
            // Return cached if available
            if (processedSchemaCache.has(collectionId)) {
                return processedSchemaCache.get(collectionId) || null;
            }
            
            const collectionConfig = config.collections.find(c => c.collectionId === collectionId);
            if (!collectionConfig) {
                processedSchemaCache.set(collectionId, null);
                return null;
            }
            
            const collection = await fetchCollection(collectionId);
            if (!collection) {
                console.warn(`[wix-data] Collection not found: ${collectionId}`);
                processedSchemaCache.set(collectionId, null);
                return null;
            }
            
            // Process schema with collection fetcher for embedded references
            const processed = await processSchema(collection, collectionConfig, fetchCollection);
            processedSchemaCache.set(collectionId, processed);
            
            return processed;
        },
        
        async getProcessedSchemas(filter: (config: CollectionConfig) => boolean): Promise<ProcessedSchema[]> {
            const matchingConfigs = config.collections.filter(filter);
            
            const results = await Promise.all(
                matchingConfigs.map(c => service.getProcessedSchema(c.collectionId))
            );
            
            return results.filter((s): s is ProcessedSchema => s !== null);
        }
    };
    
    registerService(WIX_DATA_SERVICE_MARKER, service);
    return service;
}
