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

type ItemsClient = typeof items;
type CollectionsClient = typeof collections;

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
    
    const service: WixDataService = {
        items: itemsClient,
        collections: collectionsClient,
        config,
    };
    
    registerService(WIX_DATA_SERVICE_MARKER, service);
    return service;
}
