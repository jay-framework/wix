import { WixClient } from "@wix/sdk";
import {getCategoriesClient, getInventoryClient, getProductsV3Client} from "./wix-store-api";
import {createJayService} from "@jay-framework/fullstack-component";
import {registerService} from "@jay-framework/stack-server-runtime/dist";

export interface WixStoresService {
    products: ReturnType<typeof getProductsV3Client>;
    categories: ReturnType<typeof getCategoriesClient>;
    inventory: ReturnType<typeof getInventoryClient>;
}

/**
 * Server context marker for Wix Stores services.
 * Use with `.withServerContext(WixStoresContextMarker)` in component definitions.
 */
export const WIX_STORES_SERVICE_MARKER = createJayService<WixStoresService>('Wix Store Service');
console.log('WIX_STORES_SERVICE_MARKER');
/**
 * Creates and returns a Wix Stores context instance.
 * This should be provided at the application level to make it available to all components.
 */
export function provideWixStoresService(wixClient: WixClient): WixStoresService {
    const service: WixStoresService = {
        products: getProductsV3Client(wixClient),
        categories: getCategoriesClient(wixClient),
        inventory: getInventoryClient(wixClient),
    };

    registerService(WIX_STORES_SERVICE_MARKER, service);
    return service;

}

