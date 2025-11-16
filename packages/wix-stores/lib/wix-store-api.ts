import { getClient } from "@jay-framework/wix-server-client";
// Singleton instances
import {collections, inventoryItemsV3, productsV3} from "@wix/stores";

const instances: {
  productsV3ClientInstance: typeof productsV3 | undefined;
  collectionsClientInstance: typeof collections | undefined;
  inventoryV3ClientInstance: typeof inventoryItemsV3 | undefined;
} = {
  productsV3ClientInstance: undefined,
  collectionsClientInstance: undefined,
  inventoryV3ClientInstance: undefined
}


/**
 * Get a configured Wix Stores Products V3 client (singleton)
 *
 * The Products V3 API is part of the new Catalog V3 system that provides
 * advanced product management capabilities for sophisticated e-commerce applications.
 *
 * @returns Products V3 client instance from @wix/stores
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/catalog-v3/introduction
 */
export function getProductsV3Client(): typeof productsV3 {
    if (!instances.productsV3ClientInstance) {
        const wixClient = getClient();
        instances.productsV3ClientInstance = wixClient.use(productsV3);
    }
    return instances.productsV3ClientInstance;
}

/**
 * Get a configured Wix Stores Collections client (singleton)
 *
 * The Collections API allows you to manage product collections in your Wix store.
 *
 * @returns Collections client instance from @wix/stores
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/collections/introduction
 */
export function getCollectionsClient(): typeof collections {
    if (!instances.collectionsClientInstance) {
        const wixClient = getClient();
        instances.collectionsClientInstance = wixClient.use(collections);
    }
    return instances.collectionsClientInstance;
}

/**
 * Get a configured Wix Stores Inventory V3 client (singleton)
 *
 * The Inventory API allows you to manage product inventory in your Wix store.
 *
 * @returns Inventory client instance from @wix/stores
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/inventory/introduction
 */
export function getInventoryClient(): typeof inventoryItemsV3 {
    if (!instances.inventoryV3ClientInstance) {
        const wixClient = getClient();
        instances.inventoryV3ClientInstance = wixClient.use(inventoryItemsV3);
    }
    return instances.inventoryV3ClientInstance;
}