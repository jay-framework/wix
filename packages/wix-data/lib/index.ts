import { getClient } from "@jay-framework/wix-server-client";
import { items, collections } from "@wix/data";

// Re-export everything from @wix/data for convenience
export * from "@wix/data";

// Singleton instances
let itemsClientInstance: typeof items | undefined;
let collectionsClientInstance: typeof collections | undefined;

/**
 * Get a configured Wix Data Items client (singleton)
 * 
 * The Items API allows you to access and manage items in a Wix site's data collections.
 * 
 * @returns Items client instance from @wix/data
 * @see https://dev.wix.com/docs/sdk/backend-modules/data/items/introduction
 */
export function getItemsClient() {
    if (!itemsClientInstance) {
        const wixClient = getClient();
        itemsClientInstance = wixClient.use(items);
    }
    return itemsClientInstance;
}

/**
 * Get a configured Wix Data Collections client (singleton)
 * 
 * The Collections API allows you to manage a site's data collections.
 * 
 * @returns Collections client instance from @wix/data
 * @see https://dev.wix.com/docs/sdk/backend-modules/data/collections/introduction
 */
export function getCollectionsClient() {
    if (!collectionsClientInstance) {
        const wixClient = getClient();
        collectionsClientInstance = wixClient.use(collections);
    }
    return collectionsClientInstance;
}

