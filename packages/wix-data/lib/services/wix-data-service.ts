/**
 * Server-side Wix Data Service
 * 
 * Provides access to Wix Data APIs on the server using API Key authentication.
 * Used with .withServices(WIX_DATA_SERVICE_MARKER) in component definitions.
 */

import { WixClient } from '@wix/sdk';
import { items, collections } from '@wix/data';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { WixDataConfig, CollectionConfig } from '../config/config-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ItemsClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CollectionsClient = any;

/**
 * Wix Data Service interface
 * 
 * Provides access to Wix Data APIs and configuration.
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
     * Create a query builder for a collection
     * @param collectionId - The collection ID to query
     * @returns A query builder
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryCollection(collectionId: string): any;
}

/**
 * Server service marker for Wix Data.
 * Use with `.withServices(WIX_DATA_SERVICE_MARKER)` in component definitions.
 */
export const WIX_DATA_SERVICE_MARKER = createJayService<WixDataService>('Wix Data Service');

// Singleton instances
let itemsClientInstance: ItemsClient | undefined;
let collectionsClientInstance: CollectionsClient | undefined;

/**
 * Get Items client singleton
 */
function getItemsClient(wixClient: WixClient): ItemsClient {
    if (!itemsClientInstance) {
        itemsClientInstance = wixClient.use(items);
    }
    return itemsClientInstance;
}

/**
 * Get Collections client singleton
 */
function getCollectionsClient(wixClient: WixClient): CollectionsClient {
    if (!collectionsClientInstance) {
        collectionsClientInstance = wixClient.use(collections);
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
    const itemsClient = getItemsClient(wixClient);
    const collectionsClient = getCollectionsClient(wixClient);
    
    const service: WixDataService = {
        items: itemsClient,
        collections: collectionsClient,
        config,
        
        getCollectionConfig(collectionId: string): CollectionConfig | undefined {
            return config.collections.find(c => c.collectionId === collectionId);
        },
        
        queryCollection(collectionId: string) {
            // The Wix Data items SDK uses queryDataItems
            return itemsClient.queryDataItems({
                dataCollectionId: collectionId
            });
        }
    };
    
    registerService(WIX_DATA_SERVICE_MARKER, service);
    return service;
}
