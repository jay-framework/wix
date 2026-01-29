/**
 * Client-side Wix Stores Context
 * 
 * Provides access to Wix Stores APIs on the client using OAuth authentication.
 * Delegates cart operations to WIX_CART_CONTEXT from the shared wix-cart package.
 * 
 * Usage in interactive components:
 * ```typescript
 * const storesContext = useContext(WIX_STORES_CONTEXT);
 * // Reactive cart indicator signals (delegated to WIX_CART_CONTEXT)
 * const count = storesContext.cartIndicator.itemCount();
 * const hasItems = storesContext.cartIndicator.hasItems();
 * // Cart operations (delegated to WIX_CART_CONTEXT)
 * await storesContext.addToCart(productId, 1);
 * const cartState = await storesContext.getEstimatedCart();
 * // Stores-specific operations
 * await storesContext.loadMoreCategoryProducts(categoryId, cursor, pageSize);
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
import { getCategoriesClient, getProductsV3Client } from '../utils/wix-store-api';
import { mapProductToCard } from '../utils/product-mapper';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';

// ============================================================================
// Type Definitions
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

/**
 * Reactive cart indicator state.
 * Signals update automatically when cart operations occur.
 */
export interface ReactiveCartIndicator {
    /** Number of items in cart (reactive signal) */
    itemCount: Getter<number>;
    /** Whether cart has items (reactive signal) */
    hasItems: Getter<boolean>;
}

/**
 * Result of a cart operation that modifies items.
 */
export interface CartOperationResult {
    /** Updated cart state after the operation */
    cartState: CartState;
}

export interface SelectedOptionsAndModifiers {
    /** options as (option._id, choice.choiceId) pairs */
    options: Record<string, string>;
    /** modifiers as (modifier._id, choice.choiceId) pairs - translated to keys in addToCart */
    modifiers: Record<string, string>;
    /** custom text fields as (modifier._id, user input) pairs - translated to keys in addToCart */
    customTextFields: Record<string, string>;
}

/**
 * Client-side Wix Stores context interface.
 * Provides reactive cart indicator (delegated to WIX_CART_CONTEXT) and stores-specific operations.
 */
export interface WixStoresContext {
    // ========================================================================
    // Reactive Cart Indicator (delegated to WIX_CART_CONTEXT)
    // ========================================================================
    
    /**
     * Reactive cart indicator signals.
     * Use these in render functions for automatic updates.
     */
    cartIndicator: ReactiveCartIndicator;
    
    // ========================================================================
    // Cart Operations (delegated to WIX_CART_CONTEXT)
    // ========================================================================
    
    refreshCartIndicator(): Promise<void>;
    getEstimatedCart(): Promise<CartState>;
    addToCart(productId: string, quantity?: number, selections?: SelectedOptionsAndModifiers): Promise<CartOperationResult>;
    removeLineItems(lineItemIds: string[]): Promise<CartOperationResult>;
    updateLineItemQuantity(lineItemId: string, quantity: number): Promise<CartOperationResult>;
    clearCart(): Promise<void>;
    applyCoupon(couponCode: string): Promise<CartOperationResult>;
    removeCoupon(): Promise<CartOperationResult>;
    
    // ========================================================================
    // Stores-Specific Operations
    // ========================================================================
    
    /**
     * Load more products for a category using cursor pagination.
     * Used by category page interactive phase for "load more" functionality.
     * 
     * @param categoryId - The category ID to load products for
     * @param cursor - Cursor from previous pagingMetadata.cursors.next
     * @param pageSize - Number of products to load
     * @returns Products, next cursor (null if no more), and total count
     */
    loadMoreCategoryProducts(
        categoryId: string,
        cursor: string,
        pageSize: number
    ): Promise<{
        products: ProductCardViewState[];
        nextCursor: string | null;
        totalProducts: number;
    }>;
}

/**
 * Context marker for client-side Wix Stores operations.
 */
export const WIX_STORES_CONTEXT = createJayContext<WixStoresContext>();

// ============================================================================
// Context Factory
// ============================================================================

/**
 * Initialize and register the Wix Stores client context.
 * Called during client-side initialization.
 * 
 * Assumes WIX_CLIENT_CONTEXT and WIX_CART_CONTEXT are already initialized.
 * 
 * @returns The created context for immediate use
 */
export function provideWixStoresContext(): WixStoresContext {
    // Get the Wix client from wix-server-client plugin
    const wixClientContext = useGlobalContext(WIX_CLIENT_CONTEXT);
    const wixClient = wixClientContext.client;

    // Get the cart context (provided by wix-cart plugin)
    const cartContext = useGlobalContext(WIX_CART_CONTEXT);

    // Get stores-specific API clients
    const catalogClient = getProductsV3Client(wixClient);
    const categoriesClient = getCategoriesClient(wixClient);

    // Create and register the reactive stores context
    const storesContext = registerReactiveGlobalContext(WIX_STORES_CONTEXT, () => {
        
        // ====================================================================
        // Cart Operations - Delegate to WIX_CART_CONTEXT
        // ====================================================================
        
        async function addToCart(
            productId: string, 
            quantity: number = 1, 
            selections?: SelectedOptionsAndModifiers
        ): Promise<CartOperationResult> {
            console.log(`[WixStores] Adding to cart: ${productId} x ${quantity}`, selections);
            
            // Fetch product to get variant info (V3 API)
            const product = await catalogClient.getProduct(productId, { fields: ["VARIANT_OPTION_CHOICE_NAMES"] });

            // Find matching variant based on selected options
            let variant = product.variantsInfo?.variants?.find(v =>
                v.choices?.every(choice => 
                    selections?.options?.[choice.optionChoiceIds?.optionId] === choice.optionChoiceIds?.choiceId
                )
            );
            
            // Fallback to first variant if no match found
            if (!variant && product.variantsInfo?.variants?.length > 0) {
                variant = product.variantsInfo.variants[0];
            }

            if (!variant) {
                console.warn(`[WixStores] No variant found for product ${productId}`);
                return { cartState: await cartContext.getEstimatedCart() };
            }

            // Translate modifier selections from (modifierId, choiceId) to (key, key)
            const translatedModifiers: Record<string, string> = {};
            const translatedCustomTextFields: Record<string, string> = {};
            
            if (selections?.modifiers || selections?.customTextFields) {
                for (const modifier of (product.modifiers || [])) {
                    const modifierId = modifier._id;
                    const modifierKey = modifier['key'];
                    
                    if (!modifierKey) continue;
                    
                    const selectedChoiceId = selections?.modifiers?.[modifierId];
                    if (selectedChoiceId && modifier.choicesSettings?.choices) {
                        const choice = modifier.choicesSettings.choices.find(c => c.choiceId === selectedChoiceId);
                        if (choice?.key) {
                            translatedModifiers[modifierKey] = choice.key;
                        }
                    }
                    
                    const customText = selections?.customTextFields?.[modifierId];
                    if (customText) {
                        translatedCustomTextFields[modifierKey] = customText;
                    }
                }
            }

            // Delegate to cart context with resolved variant
            return cartContext.addToCart(productId, quantity, {
                variantId: variant._id,
                modifiers: translatedModifiers,
                customTextFields: translatedCustomTextFields,
            });
        }

        // ====================================================================
        // Stores-Specific Operations
        // ====================================================================
        
        async function loadMoreCategoryProducts(
            categoryId: string,
            cursor: string,
            pageSize: number
        ): Promise<{ products: ProductCardViewState[]; nextCursor: string | null; totalProducts: number }> {
            try {
                const itemsResult = await categoriesClient.listItemsInCategory(
                    categoryId,
                    { appNamespace: "@wix/stores" },
                    {
                        useCategoryArrangement: true,
                        cursorPaging: { limit: pageSize, cursor }
                    }
                );

                const items = itemsResult.items || [];
                const nextCursor = itemsResult.pagingMetadata?.cursors?.next || null;
                const totalProducts = itemsResult.pagingMetadata?.total || items.length;

                const productPromises = items
                    .filter(item => item.catalogItemId)
                    .map(async (item) => {
                        try {
                            const product = await catalogClient.getProduct(
                                item.catalogItemId!,
                                { fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'] }
                            );
                            if (product) {
                                return mapProductToCard(product, '/products');
                            }
                        } catch (err) {
                            console.error('[WixStores] Failed to load product:', item.catalogItemId, err);
                        }
                        return null;
                    });

                const products = (await Promise.all(productPromises)).filter(Boolean) as ProductCardViewState[];

                return { products, nextCursor, totalProducts };
            } catch (error) {
                console.error('[WixStores] Failed to load more category products:', error);
                return { products: [], nextCursor: null, totalProducts: 0 };
            }
        }
        
        return {
            // Delegate cart indicator and operations to WIX_CART_CONTEXT
            cartIndicator: cartContext.cartIndicator,
            refreshCartIndicator: () => cartContext.refreshCartIndicator(),
            getEstimatedCart: () => cartContext.getEstimatedCart(),
            addToCart,  // Custom implementation that resolves V3 variants first
            removeLineItems: (ids) => cartContext.removeLineItems(ids),
            updateLineItemQuantity: (id, qty) => cartContext.updateLineItemQuantity(id, qty),
            clearCart: () => cartContext.clearCart(),
            applyCoupon: (code) => cartContext.applyCoupon(code),
            removeCoupon: () => cartContext.removeCoupon(),
            // Stores-specific operations
            loadMoreCategoryProducts,
        };
    });
    
    console.log('[wix-stores] Client stores context initialized (delegating cart to wix-cart)');
    return storesContext;
}
