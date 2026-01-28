/**
 * Wix Store V1 API Client Factories
 * 
 * These functions create singleton instances of Wix Catalog V1 API clients.
 * Used by both the server service and client context.
 * 
 * Key difference from V3:
 * - Uses `products` module instead of `productsV3`
 * - Uses `collections` module instead of `@wix/categories`
 */

import { WixClient } from "@wix/sdk";
import { products, collections, inventory } from "@wix/stores";
import { currentCart } from "@wix/ecom";

const instances: {
    productsClientInstance: typeof products | undefined;
    collectionsClientInstance: typeof collections | undefined;
    inventoryClientInstance: typeof inventory | undefined;
    currentCartInstance: typeof currentCart | undefined;
} = {
    productsClientInstance: undefined,
    collectionsClientInstance: undefined,
    inventoryClientInstance: undefined,
    currentCartInstance: undefined
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

/**
 * Get a configured Wix eCommerce Current Cart client (singleton)
 *
 * The Current Cart API allows you to manage the visitor's shopping cart.
 * This is shared between V1 and V3 packages.
 *
 * @returns Current Cart client instance from @wix/ecom
 * @see https://dev.wix.com/docs/sdk/backend-modules/ecom/current-cart/introduction
 */
export function getCurrentCartClient(wixClient: WixClient): typeof currentCart {
    if (!instances.currentCartInstance) {
        instances.currentCartInstance = wixClient.use(currentCart) as unknown as typeof currentCart;
    }
    return instances.currentCartInstance;
}
