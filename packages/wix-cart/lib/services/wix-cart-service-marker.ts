/**
 * Wix Cart Service Marker
 *
 * Service marker for cart operations. This file has no server-only imports
 * so it can be safely imported by client code.
 */

import { currentCart } from '@wix/ecom';
import { redirects } from '@wix/redirects';
import { createJayService } from '@jay-framework/fullstack-component';
import { BuildDescriptors } from '@wix/sdk-types';

export interface WixCartService {
    cart: BuildDescriptors<typeof currentCart, {}>;
    redirects: BuildDescriptors<typeof redirects, {}>;
    urls: { thankYou: string };
}

/**
 * Server service marker for Wix Cart.
 * Use with `.withServices(WIX_CART_SERVICE)` in component definitions.
 */
export const WIX_CART_SERVICE = createJayService<WixCartService>('Wix Cart Service');
