/**
 * Wix Cart Service Marker
 * 
 * Service marker for cart operations. This file has no server-only imports
 * so it can be safely imported by client code.
 */

import { currentCart } from '@wix/ecom';
import { createJayService } from '@jay-framework/fullstack-component';

export interface WixCartService {
    cart: typeof currentCart;
}

/**
 * Server service marker for Wix Cart.
 * Use with `.withServices(WIX_CART_SERVICE)` in component definitions.
 */
export const WIX_CART_SERVICE = createJayService<WixCartService>('Wix Cart Service');
