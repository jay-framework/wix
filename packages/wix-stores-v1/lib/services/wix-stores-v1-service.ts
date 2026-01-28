/**
 * Server-side Wix Stores V1 Service
 * 
 * Provides access to Wix Stores Catalog V1 APIs on the server using API Key authentication.
 * Used with .withServices(WIX_STORES_V1_SERVICE_MARKER) in component definitions.
 */

import { WixClient } from '@wix/sdk';
import { getCollectionsClient, getCurrentCartClient, getInventoryClient, getProductsClient } from '../utils/wix-store-v1-api';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';

export interface WixStoresV1Service {
    products: ReturnType<typeof getProductsClient>;
    collections: ReturnType<typeof getCollectionsClient>;
    inventory: ReturnType<typeof getInventoryClient>;
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
        cart: getCurrentCartClient(wixClient),
    };

    registerService(WIX_STORES_V1_SERVICE_MARKER, service);
    return service;
}
