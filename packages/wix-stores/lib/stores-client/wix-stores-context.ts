import { WixClient } from "@wix/sdk";
import {getCollectionsClient, getInventoryClient, getProductsV3Client} from "./wix-store-api";
import {createJayService} from "@jay-framework/fullstack-component";
import {registerService} from "@jay-framework/stack-server-runtime/dist";

export interface WixStoresContext {
    products: ReturnType<typeof getProductsV3Client>;
    collections: ReturnType<typeof getCollectionsClient>;
    inventory: ReturnType<typeof getInventoryClient>;
}

/**
 * Server context marker for Wix Stores services.
 * Use with `.withServerContext(WixStoresContextMarker)` in component definitions.
 */
export const WIX_STORES_SERVICE_MARKER = createJayService<WixStoresContext>('Wix Store Context');

/**
 * Creates and returns a Wix Stores context instance.
 * This should be provided at the application level to make it available to all components.
 */
export function provideWixStoresService(wixClient: WixClient): WixStoresContext {
    const service: WixStoresContext = {
        products: getProductsV3Client(wixClient),
        collections: getCollectionsClient(wixClient),
        inventory: getInventoryClient(wixClient),
    };

    registerService(WIX_STORES_SERVICE_MARKER, service);
    return service;

}

