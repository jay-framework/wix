/**
 * Server-side Wix Stores V1 Service
 *
 * Provides access to Wix Stores Catalog V1 APIs on the server using API Key authentication.
 * Used with .withServices(WIX_STORES_V1_SERVICE_MARKER) in component definitions.
 *
 * Note: Cart service is provided separately by WIX_CART_SERVICE from wix-cart package.
 */

import type { WixClient } from '@wix/sdk';
import { createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';

export interface WixStoresV1Service {
    wixClient: WixClient;
}

export const WIX_STORES_V1_SERVICE_MARKER =
    createJayService<WixStoresV1Service>('Wix Store V1 Service');

export function provideWixStoresV1Service(wixClient: WixClient): WixStoresV1Service {
    const service: WixStoresV1Service = { wixClient };
    registerService(WIX_STORES_V1_SERVICE_MARKER, service);
    return service;
}
