/**
 * Client-side Wix Stores V1 Context
 * 
 * Provides access to Wix Stores Catalog V1 APIs on the client.
 * Delegates cart operations to WIX_CART_CONTEXT from the shared wix-cart package.
 * 
 * Usage in interactive components:
 * ```typescript
 * const storesContext = useContext(WIX_STORES_V1_CONTEXT);
 * // Reactive cart indicator signals (delegated to WIX_CART_CONTEXT)
 * const count = storesContext.cartIndicator.itemCount();
 * // Cart operations (delegated to WIX_CART_CONTEXT)
 * await storesContext.addToCart(productId, 1);
 * // V1-specific operations
 * await storesContext.loadMoreCollectionProducts(collectionId, page, pageSize);
 * ```
 */

import { createJayContext, useGlobalContext } from '@jay-framework/runtime';
import { registerReactiveGlobalContext } from '@jay-framework/component';
import { Getter } from '@jay-framework/reactive';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
import { 
    WIX_CART_CONTEXT,
    type CartState,
    type CartOperationResult as CartResult
} from '@jay-framework/wix-cart';
import { getCollectionsClient, getProductsClient } from '../utils/wix-store-v1-api';
import { mapProductToCard, CollectionViewState, mapCollectionToViewState } from '../utils/product-mapper-v1';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration passed from server to client for Wix Stores V1.
 */
export interface WixStoresV1InitData {
    /** Enable client-side cart operations */
    enableClientCart: boolean;
    /** Enable client-side search */
    enableClientSearch: boolean;
}

/**
 * Reactive cart indicator state.
 */
export interface ReactiveCartIndicator {
    itemCount: Getter<number>;
    hasItems: Getter<boolean>;
}

/**
 * Result of a cart operation that modifies items.
 */
export interface CartOperationResult {
    cartState: CartState;
}

/**
 * Client-side Wix Stores V1 context interface.
 */
export interface WixStoresV1Context {
    // Reactive Cart Indicator (delegated to WIX_CART_CONTEXT)
    cartIndicator: ReactiveCartIndicator;
    
    // Cart Operations (delegated to WIX_CART_CONTEXT)
    refreshCartIndicator(): Promise<void>;
    getEstimatedCart(): Promise<CartState>;
    addToCart(productId: string, quantity?: number, variantId?: string): Promise<CartOperationResult>;
    removeLineItems(lineItemIds: string[]): Promise<CartOperationResult>;
    updateLineItemQuantity(lineItemId: string, quantity: number): Promise<CartOperationResult>;
    clearCart(): Promise<void>;
    applyCoupon(couponCode: string): Promise<CartOperationResult>;
    removeCoupon(): Promise<CartOperationResult>;
    
    // V1-Specific Operations - Collection Operations
    loadMoreCollectionProducts(
        collectionId: string,
        page: number,
        pageSize: number
    ): Promise<{
        products: ProductCardViewState[];
        hasMore: boolean;
        totalProducts: number;
    }>;
    
    getCollections(): Promise<CollectionViewState[]>;
}

/**
 * Context marker for client-side Wix Stores V1 operations.
 */
export const WIX_STORES_V1_CONTEXT = createJayContext<WixStoresV1Context>();

// ============================================================================
// Context Factory
// ============================================================================

/**
 * Initialize and register the Wix Stores V1 client context.
 * 
 * Assumes WIX_CLIENT_CONTEXT and WIX_CART_CONTEXT are already initialized.
 */
export function provideWixStoresV1Context(): WixStoresV1Context {
    const wixClientContext = useGlobalContext(WIX_CLIENT_CONTEXT);
    const wixClient = wixClientContext.client;

    // Get the cart context (provided by wix-cart plugin)
    const cartContext = useGlobalContext(WIX_CART_CONTEXT);

    // Get V1-specific API clients
    const productsClient = getProductsClient(wixClient);
    const collectionsClient = getCollectionsClient(wixClient);

    const storesContext = registerReactiveGlobalContext(WIX_STORES_V1_CONTEXT, () => {
        
        // ====================================================================
        // Cart Operations - Delegate to WIX_CART_CONTEXT
        // ====================================================================
        
        async function addToCart(
            productId: string, 
            quantity: number = 1, 
            variantId?: string
        ): Promise<CartOperationResult> {
            console.log(`[WixStoresV1] Adding to cart: ${productId} x ${quantity}`);
            
            // For V1, get the product to find variant if not specified
            let finalVariantId = variantId;
            if (!finalVariantId) {
                try {
                    const productResult = await productsClient.getProduct(productId);
                    const product = productResult.product;
                    if (product?.variants?.[0]) {
                        finalVariantId = product.variants[0]._id;
                    }
                } catch (err) {
                    console.warn('[WixStoresV1] Could not fetch product for variant ID:', err);
                }
            }

            // Delegate to cart context with resolved variant
            return cartContext.addToCart(productId, quantity, {
                variantId: finalVariantId,
            });
        }

        // ====================================================================
        // V1-Specific Operations
        // ====================================================================
        
        // V1 uses skip-based pagination for collections
        async function loadMoreCollectionProducts(
            collectionId: string,
            page: number,
            pageSize: number
        ): Promise<{ products: ProductCardViewState[]; hasMore: boolean; totalProducts: number }> {
            try {
                const result = await productsClient.queryProducts()
                    .hasSome('collectionIds', [collectionId])
                    .skip((page - 1) * pageSize)
                    .limit(pageSize)
                    .find();

                const products = ((result.items || [])).map(p => mapProductToCard(p));
                const totalProducts = result.totalCount ?? products.length;
                const hasMore = page * pageSize < totalProducts;

                return { products, hasMore, totalProducts };
            } catch (error) {
                console.error('[WixStoresV1] Failed to load collection products:', error);
                return { products: [], hasMore: false, totalProducts: 0 };
            }
        }

        async function getCollections(): Promise<CollectionViewState[]> {
            try {
                const result = await collectionsClient.queryCollections().find();
                return (result.items || []).map(col => mapCollectionToViewState(col));
            } catch (error) {
                console.error('[WixStoresV1] Failed to load collections:', error);
                return [];
            }
        }

        return {
            // Delegate cart indicator and operations to WIX_CART_CONTEXT
            cartIndicator: cartContext.cartIndicator,
            refreshCartIndicator: () => cartContext.refreshCartIndicator(),
            getEstimatedCart: () => cartContext.getEstimatedCart(),
            addToCart,  // Custom implementation that resolves V1 variants first
            removeLineItems: (ids) => cartContext.removeLineItems(ids),
            updateLineItemQuantity: (id, qty) => cartContext.updateLineItemQuantity(id, qty),
            clearCart: () => cartContext.clearCart(),
            applyCoupon: (code) => cartContext.applyCoupon(code),
            removeCoupon: () => cartContext.removeCoupon(),
            // V1-specific operations
            loadMoreCollectionProducts,
            getCollections,
        };
    });

    console.log('[wix-stores-v1] Client stores context initialized (delegating cart to wix-cart)');
    return storesContext;
}
