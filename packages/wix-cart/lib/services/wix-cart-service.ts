/**
 * Server-side Wix Cart Service
 *
 * Provides the WixClient for cart operations on the server.
 */

import type { WixClient } from '@wix/sdk';
import { registerService } from '@jay-framework/stack-server-runtime';
import { WIX_CART_SERVICE, WixCartService } from './wix-cart-service-marker.js';

export interface WixCartServiceOptions {
    urls?: { thankYou?: string };
}

export function provideWixCartService(wixClient: WixClient): WixCartService {
    const service: WixCartService = { wixClient };
    registerService(WIX_CART_SERVICE, service);
    return service;
}

export { WIX_CART_SERVICE, type WixCartService } from './wix-cart-service-marker';
