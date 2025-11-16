/**
 * Wix Stores Server Context
 * 
 * Provides access to Wix Stores API clients in server-side rendering phases.
 * This context is injected into slow and fast render functions.
 */

import { createJayContext } from '@jay-framework/runtime';
import {getCollectionsClient, getInventoryClient, getProductsV3Client} from "../wix-store-api";

export interface WixStoresContext {
    products: ReturnType<typeof getProductsV3Client>;
    collections: ReturnType<typeof getCollectionsClient>;
    inventory: ReturnType<typeof getInventoryClient>;
}

/**
 * Server context marker for Wix Stores services.
 * Use with `.withServerContext(WixStoresContextMarker)` in component definitions.
 */
export const WixStoresContextMarker = createJayContext<WixStoresContext>();

/**
 * Creates and returns a Wix Stores context instance.
 * This should be provided at the application level to make it available to all components.
 */
export function createWixStoresContext(): WixStoresContext {
    return {
        products: getProductsV3Client(),
        collections: getCollectionsClient(),
        inventory: getInventoryClient(),
    };
}

