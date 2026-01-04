/**
 * Consolidated initialization for wix-stores plugin.
 *
 * Uses the makeJayInit pattern to define both server and client
 * initialization in a single file.
 *
 * Server: Registers the WixStoresService for server-side rendering.
 * Client: Provides client-side cart and search APIs via OAuth authentication.
 */

import { makeJayInit, createJayService } from '@jay-framework/fullstack-component';
import { registerService } from '@jay-framework/stack-server-runtime';
import { createJayContext, registerGlobalContext, useContext } from '@jay-framework/runtime';
import { getWixClient } from '@jay-framework/wix-server-client';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client/client';
import { currentCart } from '@wix/ecom';
import { products } from '@wix/stores';
import {
    getCategoriesClient,
    getCurrentCartClient,
    getInventoryClient,
    getProductsV3Client,
} from './stores-client/wix-store-api.js';
import type { WixStoresService } from './stores-client/wix-stores-service.js';
import { WIX_STORES_SERVICE_MARKER } from './stores-client/wix-stores-service.js';

// ============================================================================
// Type Definitions (shared between server and client)
// ============================================================================

/**
 * Configuration passed from server to client for Wix Stores.
 */
export interface WixStoresInitData {
    /** Enable client-side cart operations */
    enableClientCart: boolean;
    /** Enable client-side search */
    enableClientSearch: boolean;
}

// ============================================================================
// Client Types
// ============================================================================

export interface ClientCartItem {
    lineItemId: string;
    productId: string;
    productName: string;
    quantity: number;
    price: string;
    formattedPrice: string;
    imageUrl?: string;
}

export interface ClientCartState {
    itemCount: number;
    items: ClientCartItem[];
    subtotal: string;
    formattedSubtotal: string;
    currency: string;
}

export interface SearchResult {
    id: string;
    name: string;
    slug: string;
    price: string;
    formattedPrice: string;
    imageUrl?: string;
    description?: string;
}

// ============================================================================
// Client Stores Context
// ============================================================================

export interface WixStoresClientContext {
    /** Whether client-side operations are enabled */
    isEnabled: boolean;

    // Cart operations
    cart: {
        /** Get current cart state */
        getCart(): Promise<ClientCartState>;
        /** Add item to cart */
        addToCart(productId: string, quantity?: number): Promise<ClientCartState>;
        /** Update item quantity */
        updateQuantity(lineItemId: string, quantity: number): Promise<ClientCartState>;
        /** Remove item from cart */
        removeItem(lineItemId: string): Promise<ClientCartState>;
        /** Clear all items */
        clearCart(): Promise<void>;
    };

    // Search operations
    search: {
        /** Search products by query */
        searchProducts(query: string, limit?: number): Promise<SearchResult[]>;
    };
}

/**
 * Context marker for client-side Wix Stores operations.
 */
export const WIX_STORES_CLIENT_CONTEXT = createJayContext<WixStoresClientContext>();

// ============================================================================
// Helper Functions (client-only)
// ============================================================================

function mapCartToState(cart: any): ClientCartState {
    const lineItems = cart?.lineItems || [];
    const items: ClientCartItem[] = lineItems.map((item: any) => ({
        lineItemId: item._id || '',
        productId: item.catalogReference?.catalogItemId || '',
        productName: item.productName?.translated || item.productName?.original || '',
        quantity: item.quantity || 1,
        price: item.price?.amount || '0',
        formattedPrice: item.price?.formattedAmount || '$0.00',
        imageUrl: item.image?.url || item.media?.mainMedia?.image?.url,
    }));

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    return {
        itemCount,
        items,
        subtotal: cart?.subtotal?.amount || '0',
        formattedSubtotal: cart?.subtotal?.formattedAmount || '$0.00',
        currency: cart?.currency || 'USD',
    };
}

function mapProductToSearchResult(product: any): SearchResult {
    const media = product.media?.mainMedia?.image;
    const price = product.priceData?.price || product.price?.price;

    return {
        id: product._id || '',
        name: product.name || '',
        slug: product.slug || '',
        price: price?.toString() || '0',
        formattedPrice: product.priceData?.formatted?.price || `$${price || 0}`,
        imageUrl: media?.url,
        description: product.description,
    };
}

// ============================================================================
// Plugin Initialization
// ============================================================================

export const init = makeJayInit()
    .withServer(async () => {
        console.log('[wix-stores] Initializing Wix Stores service...');

        // Get the server-side Wix client (authenticated with API key)
        const wixClient = getWixClient();

        // Create and register the stores service
        const storesService: WixStoresService = {
            products: getProductsV3Client(wixClient),
            categories: getCategoriesClient(wixClient),
            inventory: getInventoryClient(wixClient),
            cart: getCurrentCartClient(wixClient),
        };

        registerService(WIX_STORES_SERVICE_MARKER, storesService);

        console.log('[wix-stores] Server initialization complete');

        // Pass store configuration to the client (typed!)
        return {
            enableClientCart: true,
            enableClientSearch: true,
        };
    })
    .withClient(async (data) => {
        // data is typed as WixStoresInitData!
        console.log('[wix-stores] Initializing client-side stores...');

        const { enableClientCart, enableClientSearch } = data;

        // Get the Wix client from wix-server-client plugin
        let wixClientContext: ReturnType<typeof useContext<typeof WIX_CLIENT_CONTEXT>> | null = null;

        try {
            wixClientContext = useContext(WIX_CLIENT_CONTEXT);
        } catch {
            console.warn('[wix-stores] WIX_CLIENT_CONTEXT not available - client operations disabled');
        }

        const wixClient = wixClientContext?.client;

        if (!wixClient || !wixClientContext?.isReady) {
            console.log('[wix-stores] Wix client not ready - registering disabled context');

            registerGlobalContext(WIX_STORES_CLIENT_CONTEXT, {
                isEnabled: false,
                cart: {
                    async getCart() {
                        throw new Error('Client cart not enabled');
                    },
                    async addToCart() {
                        throw new Error('Client cart not enabled');
                    },
                    async updateQuantity() {
                        throw new Error('Client cart not enabled');
                    },
                    async removeItem() {
                        throw new Error('Client cart not enabled');
                    },
                    async clearCart() {
                        throw new Error('Client cart not enabled');
                    },
                },
                search: {
                    async searchProducts() {
                        throw new Error('Client search not enabled');
                    },
                },
            });
            return;
        }

        // Create the stores client context
        const storesContext: WixStoresClientContext = {
            isEnabled: enableClientCart || enableClientSearch,

            cart: {
                async getCart(): Promise<ClientCartState> {
                    if (!enableClientCart) {
                        throw new Error('Client cart not enabled');
                    }
                    const cart = await wixClient.call(currentCart.getCurrentCart)();
                    return mapCartToState(cart);
                },

                async addToCart(productId: string, quantity: number = 1): Promise<ClientCartState> {
                    if (!enableClientCart) {
                        throw new Error('Client cart not enabled');
                    }

                    const result = await wixClient.call(currentCart.addToCurrentCart)({
                        lineItems: [
                            {
                                catalogReference: {
                                    catalogItemId: productId,
                                    appId: '1380b703-ce81-ff05-f115-39571d94dfcd', // Wix Stores app ID
                                },
                                quantity,
                            },
                        ],
                    });

                    return mapCartToState(result.cart);
                },

                async updateQuantity(lineItemId: string, quantity: number): Promise<ClientCartState> {
                    if (!enableClientCart) {
                        throw new Error('Client cart not enabled');
                    }

                    if (quantity === 0) {
                        const result = await wixClient.call(currentCart.removeLineItemsFromCurrentCart)([lineItemId]);
                        return mapCartToState(result.cart);
                    }

                    const result = await wixClient.call(currentCart.updateCurrentCartLineItemQuantity)([
                        { _id: lineItemId, quantity },
                    ]);
                    return mapCartToState(result.cart);
                },

                async removeItem(lineItemId: string): Promise<ClientCartState> {
                    if (!enableClientCart) {
                        throw new Error('Client cart not enabled');
                    }

                    const result = await wixClient.call(currentCart.removeLineItemsFromCurrentCart)([lineItemId]);
                    return mapCartToState(result.cart);
                },

                async clearCart(): Promise<void> {
                    if (!enableClientCart) {
                        throw new Error('Client cart not enabled');
                    }

                    const cart = await wixClient.call(currentCart.getCurrentCart)();
                    if (cart?.lineItems?.length) {
                        const lineItemIds = cart.lineItems.map((item: any) => item._id).filter(Boolean);
                        if (lineItemIds.length > 0) {
                            await wixClient.call(currentCart.removeLineItemsFromCurrentCart)(lineItemIds);
                        }
                    }
                },
            },

            search: {
                async searchProducts(query: string, limit: number = 20): Promise<SearchResult[]> {
                    if (!enableClientSearch) {
                        throw new Error('Client search not enabled');
                    }

                    const result = await wixClient
                        .call(products.queryProducts)()
                        .contains('name', query)
                        .limit(limit)
                        .find();

                    return (result.items || []).map(mapProductToSearchResult);
                },
            },
        };

        registerGlobalContext(WIX_STORES_CLIENT_CONTEXT, storesContext);

        console.log('[wix-stores] Client initialization complete');
        console.log(`[wix-stores] Cart enabled: ${enableClientCart}, Search enabled: ${enableClientSearch}`);
    });

