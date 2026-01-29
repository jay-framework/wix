/**
 * Wix Cart Client Factory
 * 
 * Creates a singleton instance of the Wix Cart client.
 * Used by both server service and client context.
 */

import { WixClient } from '@wix/sdk';
import { currentCart } from '@wix/ecom';

// Singleton instance
let currentCartInstance: typeof currentCart | undefined;

/**
 * Get a configured Wix eCommerce Current Cart client (singleton)
 *
 * The Current Cart API allows you to manage the visitor's shopping cart.
 *
 * @returns Current Cart client instance from @wix/ecom
 * @see https://dev.wix.com/docs/sdk/backend-modules/ecom/current-cart/introduction
 */
export function getCurrentCartClient(wixClient: WixClient): typeof currentCart {
    if (!currentCartInstance) {
        currentCartInstance = wixClient.use(currentCart) as unknown as typeof currentCart;
    }
    return currentCartInstance;
}
