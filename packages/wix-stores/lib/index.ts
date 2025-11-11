import { getClient } from "@jay-framework/wix-server-client";
import { products, productsV3, collections, inventory } from "@wix/stores";

// Re-export everything from @wix/stores for convenience
export * from "@wix/stores";

// Export headless components
export * from "./components";

// Singleton instances
let productsClientInstance: typeof products | undefined;
let productsV3ClientInstance: typeof productsV3 | undefined;
let collectionsClientInstance: typeof collections | undefined;
let inventoryClientInstance: typeof inventory | undefined;

/**
 * Get a configured Wix Stores Products client (singleton)
 * 
 * The Products API allows you to manage products in your Wix store.
 * 
 * @returns Products client instance from @wix/stores
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/products/introduction
 */
export function getProductsClient() {
    if (!productsClientInstance) {
        const wixClient = getClient();
        productsClientInstance = wixClient.use(products);
    }
    return productsClientInstance;
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
export function getProductsV3Client() {
    if (!productsV3ClientInstance) {
        const wixClient = getClient();
        productsV3ClientInstance = wixClient.use(productsV3);
    }
    return productsV3ClientInstance;
}

/**
 * Get a configured Wix Stores Collections client (singleton)
 * 
 * The Collections API allows you to manage product collections in your Wix store.
 * 
 * @returns Collections client instance from @wix/stores
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/collections/introduction
 */
export function getCollectionsClient() {
    if (!collectionsClientInstance) {
        const wixClient = getClient();
        collectionsClientInstance = wixClient.use(collections);
    }
    return collectionsClientInstance;
}

/**
 * Get a configured Wix Stores Inventory client (singleton)
 * 
 * The Inventory API allows you to manage product inventory in your Wix store.
 * 
 * @returns Inventory client instance from @wix/stores
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/inventory/introduction
 */
export function getInventoryClient() {
    if (!inventoryClientInstance) {
        const wixClient = getClient();
        inventoryClientInstance = wixClient.use(inventory);
    }
    return inventoryClientInstance;
}

