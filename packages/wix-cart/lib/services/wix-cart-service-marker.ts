/**
 * Wix Cart Service Marker
 *
 * Service marker for cart operations. This file has no server-only imports
 * so it can be safely imported by client code.
 */

import type { WixClient } from '@wix/sdk';
import { createJayService } from '@jay-framework/fullstack-component';

export interface WixCartService {
    wixClient: WixClient;
}

/**
 * Server service marker for Wix Cart.
 * Use with `.withServices(WIX_CART_SERVICE)` in component definitions.
 */
export const WIX_CART_SERVICE = createJayService<WixCartService>('Wix Cart Service');
