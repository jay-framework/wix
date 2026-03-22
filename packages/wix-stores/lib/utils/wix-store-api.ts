/**
 * Wix Store API Client Factories
 * 
 * These functions create singleton instances of Wix API clients.
 * Used by both the server service and client context.
 * 
 * Note: Cart client is provided by @jay-framework/wix-cart package.
 */

import { WixClient } from "@wix/sdk";
import { inventoryItemsV3, productsV3 } from "@wix/stores";
import { categories } from "@wix/categories";
import {BuildDescriptors} from "@wix/sdk-types";

const instances: {
    productsV3ClientInstance: BuildDescriptors<typeof productsV3, {}> | undefined;
    categoriesClientInstance: BuildDescriptors<typeof categories, {}> | undefined;
    inventoryV3ClientInstance: BuildDescriptors<typeof inventoryItemsV3, {}> | undefined;
} = {
    productsV3ClientInstance: undefined,
    categoriesClientInstance: undefined,
    inventoryV3ClientInstance: undefined,
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
export function getProductsV3Client(wixClient: WixClient): BuildDescriptors<typeof productsV3, {}>  {
    if (!instances.productsV3ClientInstance) {
        instances.productsV3ClientInstance = wixClient.use(productsV3);
    }
    return instances.productsV3ClientInstance;
}

/**
 * Get a configured Wix Stores Categories client (singleton)
 *
 * The Categories API allows you to manage product Categories in your Wix store.
 *
 * @returns Categories client instance from @wix/stores
 * @see https://dev.wix.com/docs/sdk/backend-modules/categories/categories/introduction
 */
export function getCategoriesClient(wixClient: WixClient): BuildDescriptors<typeof categories, {}> {
    if (!instances.categoriesClientInstance) {
        instances.categoriesClientInstance = wixClient.use(categories);
    }
    return instances.categoriesClientInstance;
}

/**
 * Get a configured Wix Stores Inventory V3 client (singleton)
 *
 * The Inventory API allows you to manage product inventory in your Wix store.
 *
 * @returns Inventory client instance from @wix/stores
 * @see https://dev.wix.com/docs/sdk/backend-modules/stores/inventory/introduction
 */
export function getInventoryClient(wixClient: WixClient): BuildDescriptors<typeof inventoryItemsV3, {}> {
    if (!instances.inventoryV3ClientInstance) {
        instances.inventoryV3ClientInstance = wixClient.use(inventoryItemsV3);
    }
    return instances.inventoryV3ClientInstance;
}

