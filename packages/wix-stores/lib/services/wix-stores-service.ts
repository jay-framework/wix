/**
 * Server-side Wix Stores Service
 * 
 * Provides access to Wix Stores APIs on the server using API Key authentication.
 * Used with .withServices(WIX_STORES_SERVICE_MARKER) in component definitions.
 */

import { WixClient } from '@wix/sdk';
import { getCategoriesClient, getCurrentCartClient, getInventoryClient, getProductsV3Client } from './wix-store-api.js';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';

export interface WixStoresService {
    products: ReturnType<typeof getProductsV3Client>;
    categories: ReturnType<typeof getCategoriesClient>;
    inventory: ReturnType<typeof getInventoryClient>;
    cart: ReturnType<typeof getCurrentCartClient>;
}

/**
 * Server service marker for Wix Stores.
 * Use with `.withServices(WIX_STORES_SERVICE_MARKER)` in component definitions.
 */
export const WIX_STORES_SERVICE_MARKER = createJayService<WixStoresService>('Wix Store Service');

/**
 * Creates, registers, and returns a Wix Stores service instance.
 * Called during server initialization.
 */
export function provideWixStoresService(wixClient: WixClient): WixStoresService {
    const service: WixStoresService = {
        products: getProductsV3Client(wixClient),
        categories: getCategoriesClient(wixClient),
        inventory: getInventoryClient(wixClient),
        cart: getCurrentCartClient(wixClient),
    };

    registerService(WIX_STORES_SERVICE_MARKER, service);
    return service;
}

