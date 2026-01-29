/**
 * Wix Store V1 API Client Factories
 * 
 * These functions create singleton instances of Wix Catalog V1 API clients.
 * Used by both the server service and client context.
 * 
 * Key difference from V3:
 * - Uses `products` module instead of `productsV3`
 * - Uses `collections` module instead of `@wix/categories`
 * 
 * Note: Cart client is provided by @jay-framework/wix-cart package.
 */

import { WixClient } from "@wix/sdk";
import { products, collections, inventory } from "@wix/stores";

const instances: {
    productsClientInstance: typeof products | undefined;
    collectionsClientInstance: typeof collections | undefined;
    inventoryClientInstance: typeof inventory | undefined;
} = {
    productsClientInstance: undefined,
    collectionsClientInstance: undefined,
    inventoryClientInstance: undefined,
};

/**
 * Get a configured Wix Stores Products client (Catalog V1) (singleton)
 *
 * The Products API (V1) is the original Wix Stores catalog API.
 *
 * @returns Products client instance from @wix/stores
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/products/introduction
 */
export function getProductsClient(wixClient: WixClient): typeof products {
    if (!instances.productsClientInstance) {
        instances.productsClientInstance = wixClient.use(products) as unknown as typeof products;
    }
    return instances.productsClientInstance;
}

/**
 * Get a configured Wix Stores Collections client (singleton)
 *
 * The Collections API allows you to manage product Collections in your Wix store.
 * Note: V3 uses @wix/categories instead.
 *
 * @returns Collections client instance from @wix/stores
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/collections/introduction
 */
export function getCollectionsClient(wixClient: WixClient): typeof collections {
    if (!instances.collectionsClientInstance) {
        instances.collectionsClientInstance = wixClient.use(collections) as unknown as typeof collections;
    }
    return instances.collectionsClientInstance;
}

/**
 * Get a configured Wix Stores Inventory client (singleton)
 *
 * The Inventory API allows you to manage product inventory in your Wix store.
 *
 * @returns Inventory client instance from @wix/stores
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/inventory/introduction
 */
export function getInventoryClient(wixClient: WixClient): typeof inventory {
    if (!instances.inventoryClientInstance) {
        instances.inventoryClientInstance = wixClient.use(inventory) as unknown as typeof inventory;
    }
    return instances.inventoryClientInstance;
}

// Note: Cart client is now provided by @jay-framework/wix-cart package
// Use: import { getCurrentCartClient } from '@jay-framework/wix-cart'
