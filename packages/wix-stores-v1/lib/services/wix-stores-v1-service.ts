/**
 * Server-side Wix Stores V1 Service
 * 
 * Provides access to Wix Stores Catalog V1 APIs on the server using API Key authentication.
 * Used with .withServices(WIX_STORES_V1_SERVICE_MARKER) in component definitions.
 * 
 * Note: Cart service is provided separately by WIX_CART_SERVICE from wix-cart package.
 */

import { WixClient } from '@wix/sdk';
import { getCollectionsClient, getInventoryClient, getProductsClient } from '../utils/wix-store-v1-api';
import { getCurrentCartClient } from '@jay-framework/wix-cart';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';

export interface WixStoresV1Service {
    products: ReturnType<typeof getProductsClient>;
    collections: ReturnType<typeof getCollectionsClient>;
    inventory: ReturnType<typeof getInventoryClient>;
    /** @deprecated Use WIX_CART_SERVICE from @jay-framework/wix-cart instead */
    cart: ReturnType<typeof getCurrentCartClient>;
}

/**
 * Server service marker for Wix Stores V1.
 * Use with `.withServices(WIX_STORES_V1_SERVICE_MARKER)` in component definitions.
 */
export const WIX_STORES_V1_SERVICE_MARKER = createJayService<WixStoresV1Service>('Wix Store V1 Service');

/**
 * Creates, registers, and returns a Wix Stores V1 service instance.
 * Called during server initialization.
 */
export function provideWixStoresV1Service(wixClient: WixClient): WixStoresV1Service {
    const service: WixStoresV1Service = {
        products: getProductsClient(wixClient),
        collections: getCollectionsClient(wixClient),
        inventory: getInventoryClient(wixClient),
        // Keep cart for backward compatibility, but prefer WIX_CART_SERVICE
        cart: getCurrentCartClient(wixClient),
    };

    registerService(WIX_STORES_V1_SERVICE_MARKER, service);
    return service;
}
