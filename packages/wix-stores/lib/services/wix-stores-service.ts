/**
 * Server-side Wix Stores Service
 *
 * Provides access to Wix Stores APIs on the server using API Key authentication.
 * Used with .withServices(WIX_STORES_SERVICE_MARKER) in component definitions.
 *
 * Note: Cart service is provided separately by WIX_CART_SERVICE from wix-cart package.
 */

import { WixClient } from '@wix/sdk';
import {
    getCategoriesClient,
    getInventoryClient,
    getProductsV3Client,
} from '../utils/wix-store-api';
import { getCurrentCartClient } from '@jay-framework/wix-cart';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';

/**
 * Maps a Wix root category to a URL prefix slug.
 * Products belonging to any child of this category get URLs like /products/{prefix}/{slug}.
 */
export interface CategoryPrefixConfig {
    /** Root category ID in Wix */
    categoryId: string;
    /** URL prefix slug (e.g., 'polgat', 'kitan') */
    prefix: string;
    /** Display name for the category (e.g., 'פולגת', 'כיתן') */
    name: string;
}

export interface WixStoresService {
    products: ReturnType<typeof getProductsV3Client>;
    categories: ReturnType<typeof getCategoriesClient>;
    inventory: ReturnType<typeof getInventoryClient>;
    /** @deprecated Use WIX_CART_SERVICE from @jay-framework/wix-cart instead */
    cart: ReturnType<typeof getCurrentCartClient>;
    /** Category-to-URL-prefix mappings. Empty array when not configured. */
    categoryPrefixes: CategoryPrefixConfig[];
}

/**
 * Server service marker for Wix Stores.
 * Use with `.withServices(WIX_STORES_SERVICE_MARKER)` in component definitions.
 */
export const WIX_STORES_SERVICE_MARKER = createJayService<WixStoresService>('Wix Store Service');

/**
 * Options for initializing the Wix Stores service.
 */
export interface WixStoresServiceOptions {
    /** Category-to-URL-prefix mappings for category-prefixed product routes */
    categoryPrefixes?: CategoryPrefixConfig[];
}

/**
 * Creates, registers, and returns a Wix Stores service instance.
 * Called during server initialization.
 */
export function provideWixStoresService(
    wixClient: WixClient,
    options?: WixStoresServiceOptions,
): WixStoresService {
    const service: WixStoresService = {
        products: getProductsV3Client(wixClient),
        categories: getCategoriesClient(wixClient),
        inventory: getInventoryClient(wixClient),
        // Keep cart for backward compatibility, but prefer WIX_CART_SERVICE
        cart: getCurrentCartClient(wixClient),
        categoryPrefixes: options?.categoryPrefixes ?? [],
    };

    registerService(WIX_STORES_SERVICE_MARKER, service);
    return service;
}
