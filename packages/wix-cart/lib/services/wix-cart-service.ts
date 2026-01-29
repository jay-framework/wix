/**
 * Server-side Wix Cart Service
 * 
 * Provides access to Wix Cart APIs on the server using API Key authentication.
 * This file contains server-only code (registerService).
 */

import { WixClient } from '@wix/sdk';
import { registerService } from '@jay-framework/stack-server-runtime';
import { getCurrentCartClient } from '../utils/cart-client';
import { WIX_CART_SERVICE, WixCartService } from './wix-cart-service-marker';

/**
 * Creates, registers, and returns a Wix Cart service instance.
 * Called during server initialization.
 */
export function provideWixCartService(wixClient: WixClient): WixCartService {
    const service: WixCartService = {
        cart: getCurrentCartClient(wixClient),
    };

    registerService(WIX_CART_SERVICE, service);
    return service;
}

// Re-export marker and types for server-side usage
export { WIX_CART_SERVICE, type WixCartService } from './wix-cart-service-marker';
export { getCurrentCartClient } from '../utils/cart-client';
