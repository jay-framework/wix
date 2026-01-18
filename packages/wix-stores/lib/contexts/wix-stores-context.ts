/**
 * Client-side Wix Stores Context
 * 
 * Provides access to Wix Stores APIs on the client using OAuth authentication.
 * This context mirrors the server-side WixStoresService structure.
 * 
 * Usage in interactive components:
 * ```typescript
 * const storesContext = useContext(WIX_STORES_CONTEXT);
 * // Reactive cart indicator signals
 * const count = storesContext.cartIndicator.itemCount();
 * const hasItems = storesContext.cartIndicator.hasItems();
 * // Cart operations (trigger indicator updates)
 * await storesContext.addToCart(productId, 1);
 * const cartState = await storesContext.getEstimatedCart();
 * ```
 */

import { createJayContext, useGlobalContext } from '@jay-framework/runtime';
import {createSignal, registerReactiveGlobalContext, useReactive} from '@jay-framework/component';
import { Getter } from '@jay-framework/reactive';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
import {getCategoriesClient, getCurrentCartClient, getProductsV3Client} from '../utils/wix-store-api';
import { mapProductToCard } from '../utils/product-mapper';
import { ProductCardViewState } from '../contracts/product-card.jay-contract';
import {
    CartState,
    getCurrentCartOrNull,
    estimateCurrentCartTotalsOrNull,
    mapCartToIndicator,
    mapCartToState,
    mapEstimateTotalsToState
} from './cart-helpers';
import {LineItem} from "@wix/auto_sdk_ecom_current-cart";

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

/** Wix Stores App ID for catalog references */
const WIX_STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

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
    options: Record<string, string>,
    /** modifiers as (modifier._id, choice.choiceId) pairs - translated to keys in addToCart */
    modifiers: Record<string, string>,
    /** custom text fields as (modifier._id, user input) pairs - translated to keys in addToCart */
    customTextFields: Record<string, string>,
}

/**
 * Client-side Wix Stores context interface.
 * Provides reactive cart indicator and encapsulated cart operations.
 */
export interface WixStoresContext {
    // ========================================================================
    // Reactive Cart Indicator
    // ========================================================================
    
    /**
     * Reactive cart indicator signals.
     * Use these in render functions for automatic updates.
     */
    cartIndicator: ReactiveCartIndicator;
    
    // ========================================================================
    // Cart Operations
    // ========================================================================
    
    /**
     * Refresh cart indicator from server.
     * Call this after external cart changes or on page load.
     */
    refreshCartIndicator(): Promise<void>;
    
    /**
     * Get full cart state with estimated totals (subtotal, tax, total).
     * Handles 404 (no cart) as empty cart.
     * Use this for cart pages where accurate totals are needed.
     */
    getEstimatedCart(): Promise<CartState>;
    
    /**
     * Add a product to the cart.
     * Automatically updates the cart indicator signals.
     * 
     * @param productId - The product ID to add
     * @param quantity - Number of items to add (default: 1)
     * @param selections - details of selected options and modifiers
     * @returns Updated cart state
     */
    addToCart(productId: string, quantity?: number, selections?: SelectedOptionsAndModifiers): Promise<CartOperationResult>;
    
    /**
     * Remove line items from the cart.
     * Automatically updates the cart indicator signals.
     * 
     * @param lineItemIds - Array of line item IDs to remove
     * @returns Updated cart state
     */
    removeLineItems(lineItemIds: string[]): Promise<CartOperationResult>;
    
    /**
     * Update a line item's quantity.
     * If quantity is 0, the item is removed.
     * Automatically updates the cart indicator signals.
     * 
     * @param lineItemId - The line item ID to update
     * @param quantity - New quantity (0 removes the item)
     * @returns Updated cart state
     */
    updateLineItemQuantity(lineItemId: string, quantity: number): Promise<CartOperationResult>;
    
    /**
     * Clear all items from the cart.
     * Automatically updates the cart indicator signals.
     */
    clearCart(): Promise<void>;
    
    /**
     * Apply a coupon code to the cart.
     * Automatically updates the cart indicator signals.
     * 
     * @param couponCode - The coupon code to apply
     * @returns Updated cart state
     */
    applyCoupon(couponCode: string): Promise<CartOperationResult>;
    
    /**
     * Remove applied coupon from the cart.
     * Automatically updates the cart indicator signals.
     * 
     * @returns Updated cart state
     */
    removeCoupon(): Promise<CartOperationResult>;
    
    // ========================================================================
    // Category Operations
    // ========================================================================
    
    /**
     * Load products for a category page with pagination and sorting.
     * Used by category page interactive phase to reload products.
     * 
     * @param categoryId - The category ID to load products for
     * @param page - Page number (1-indexed)
     * @param pageSize - Number of products per page
     * @param sort - Sort option (newest, priceAsc, priceDesc, nameAsc, nameDesc)
     * @returns Products and pagination metadata
     */
    loadCategoryProducts(
        categoryId: string,
        page: number,
        pageSize: number,
        sort: string
    ): Promise<{
        products: ProductCardViewState[];
        totalProducts: number;
        totalPages: number;
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
 * Assumes WIX_CLIENT_CONTEXT is already initialized with a valid client.
 * 
 * @returns The created context for immediate use (e.g., to call refreshCartIndicator)
 */
export function provideWixStoresContext(): WixStoresContext {
    // Get the Wix client from wix-server-client plugin
    const wixClientContext = useGlobalContext(WIX_CLIENT_CONTEXT);
    const wixClient = wixClientContext.client;

    // Get API clients
    const cartClient = getCurrentCartClient(wixClient);
    const catalogClient = getProductsV3Client(wixClient);
    const categoriesClient = getCategoriesClient(wixClient);

    // Create and register the reactive stores context
    const storesContext = registerReactiveGlobalContext(WIX_STORES_CONTEXT, () => {
        // Reactive signals for cart indicator
        const [itemCount, setItemCount] = createSignal(0);
        const [hasItems, setHasItems] = createSignal(false);
        const reactive = useReactive();

        // Helper to update indicator signals from cart data
        function updateIndicatorFromCart(cart: Awaited<ReturnType<typeof getCurrentCartOrNull>>) {
            const indicator = mapCartToIndicator(cart);
            reactive.batchReactions(() => {
                setItemCount(indicator.itemCount);
                setHasItems(indicator.hasItems);
            })
        }

        // Refresh cart indicator from server
        async function refreshCartIndicator(): Promise<void> {
            const cart = await getCurrentCartOrNull(cartClient);
            updateIndicatorFromCart(cart);
        }

        // Get full cart state with estimated totals
        async function getEstimatedCart(): Promise<CartState> {
            const estimate = await estimateCurrentCartTotalsOrNull(cartClient);
            return mapEstimateTotalsToState(estimate);
        }

        // Add product to cart
        async function addToCart(productId: string, quantity: number = 1, selections?: SelectedOptionsAndModifiers): Promise<CartOperationResult> {
            console.log(`Adding to cart: ${productId} - ${quantity}:`, selections);
            const product = await catalogClient.getProduct(productId, {fields: ["VARIANT_OPTION_CHOICE_NAMES"]});

            // Find matching variant based on selected options
            // First try to match by selections, then fallback to first variant
            let variant = product.variantsInfo?.variants?.find(v =>
                v.choices?.every(choice => 
                    selections?.options?.[choice.optionChoiceIds?.optionId] === choice.optionChoiceIds?.choiceId
                )
            );
            
            // Fallback to first variant if no match found (e.g., product with no options or simple product)
            if (!variant && product.variantsInfo?.variants?.length > 0) {
                variant = product.variantsInfo.variants[0];
            }

            if (variant) {
                // Translate modifier selections from (modifierId, choiceId) to (key, key)
                // The Wix Cart API expects modifier.key and choice.key, not IDs
                const translatedModifiers: Record<string, string> = {};
                const translatedCustomTextFields: Record<string, string> = {};
                
                if (selections?.modifiers || selections?.customTextFields) {
                    for (const modifier of (product.modifiers || [])) {
                        const modifierId = modifier._id;
                        // Cast to access key properties that may not be in SDK types
                        const modifierKey = modifier['key'];
                        
                        if (!modifierKey) continue;
                        
                        // Check for choice-based modifier selection
                        const selectedChoiceId = selections?.modifiers?.[modifierId];
                        if (selectedChoiceId && modifier.choicesSettings?.choices) {
                            const choice = modifier.choicesSettings.choices.find(c => c.choiceId === selectedChoiceId);
                            if (choice?.key) {
                                translatedModifiers[modifierKey] = choice.key;
                            }
                        }
                        
                        // Check for free text modifier
                        const customText = selections?.customTextFields?.[modifierId];
                        if (customText) {
                            translatedCustomTextFields[modifierKey] = customText;
                        }
                    }
                }

                const lineItem: LineItem = {
                    catalogReference: {
                        catalogItemId: productId,
                        appId: WIX_STORES_APP_ID,
                        options: {
                            variantId: variant._id,
                            options: translatedModifiers,
                            customTextFields: translatedCustomTextFields,
                        }
                    },
                    quantity,
                };
                const result = await cartClient.addToCurrentCart({
                    lineItems: [lineItem],
                });
                updateIndicatorFromCart(result.cart ?? null);
                return { cartState: mapCartToState(result.cart ?? null) };
            }
            
            console.warn(`No variant found for product ${productId}`);
            return { cartState: mapCartToState(null)}
        }

        // Remove line items from cart
        async function removeLineItems(lineItemIds: string[]): Promise<CartOperationResult> {
            const result = await cartClient.removeLineItemsFromCurrentCart(lineItemIds);
            updateIndicatorFromCart(result.cart ?? null);
            return { cartState: mapCartToState(result.cart ?? null) };
        }

        // Update line item quantity
        async function updateLineItemQuantity(lineItemId: string, quantity: number): Promise<CartOperationResult> {
            let result;
            if (quantity === 0) {
                result = await cartClient.removeLineItemsFromCurrentCart([lineItemId]);
            } else {
                result = await cartClient.updateCurrentCartLineItemQuantity([
                    { _id: lineItemId, quantity }
                ]);
            }
            updateIndicatorFromCart(result.cart ?? null);
            return { cartState: mapCartToState(result.cart ?? null) };
        }

        // Clear all items from cart
        async function clearCart(): Promise<void> {
            const cart = await getCurrentCartOrNull(cartClient);
            if (cart?.lineItems?.length) {
                const lineItemIds = cart.lineItems
                    .map((item: { _id?: string }) => item._id || '')
                    .filter(Boolean);
                if (lineItemIds.length > 0) {
                    await cartClient.removeLineItemsFromCurrentCart(lineItemIds);
                }
            }
            setItemCount(0);
            setHasItems(false);
        }

        // Apply coupon to cart
        async function applyCoupon(couponCode: string): Promise<CartOperationResult> {
            const result = await cartClient.updateCurrentCart({ couponCode });
            updateIndicatorFromCart(result ?? null);
            return { cartState: mapCartToState(result ?? null) };
        }

        // Remove coupon from cart
        async function removeCoupon(): Promise<CartOperationResult> {
            const result = await cartClient.removeCouponFromCurrentCart();
            updateIndicatorFromCart(result.cart ?? null);
            return { cartState: mapCartToState(result.cart ?? null) };
        }

        // Load products for a category with pagination
        async function loadCategoryProducts(
            categoryId: string,
            page: number,
            pageSize: number,
            sort: string
        ): Promise<{ products: ProductCardViewState[]; totalProducts: number; totalPages: number }> {
            try {
                // List items in category
                const itemsResult = await categoriesClient.listItemsInCategory(
                    categoryId,
                    { appNamespace: "@wix/stores" },
                    {
                        useCategoryArrangement: true,
                        cursorPaging: { limit: pageSize }
                    }
                );

                const items = itemsResult.items || [];
                const totalProducts = itemsResult.pagingMetadata?.total || items.length;
                const totalPages = Math.ceil(totalProducts / pageSize) || 1;

                // Fetch full product details
                const productCards: ProductCardViewState[] = [];
                for (const item of items) {
                    if (item.catalogItemId) {
                        try {
                            const product = await catalogClient.getProduct(
                                item.catalogItemId,
                                { fields: ['CURRENCY', 'VARIANT_OPTION_CHOICE_NAMES'] }
                            );
                            if (product) {
                                productCards.push(mapProductToCard(product, '/products'));
                            }
                        } catch (err) {
                            console.error('Failed to load product:', item.catalogItemId, err);
                        }
                    }
                }

                // Client-side sort (since API doesn't support sort in listItemsInCategory)
                if (sort === 'priceAsc') {
                    productCards.sort((a, b) => 
                        parseFloat(a.actualPriceRange.minValue.amount) - parseFloat(b.actualPriceRange.minValue.amount)
                    );
                } else if (sort === 'priceDesc') {
                    productCards.sort((a, b) => 
                        parseFloat(b.actualPriceRange.minValue.amount) - parseFloat(a.actualPriceRange.minValue.amount)
                    );
                } else if (sort === 'nameAsc') {
                    productCards.sort((a, b) => a.name.localeCompare(b.name));
                } else if (sort === 'nameDesc') {
                    productCards.sort((a, b) => b.name.localeCompare(a.name));
                }
                // 'newest' is default from API arrangement

                return { products: productCards, totalProducts, totalPages };
            } catch (error) {
                console.error('Failed to load category products:', error);
                return { products: [], totalProducts: 0, totalPages: 0 };
            }
        }
        
        return {
            cartIndicator: {
                itemCount,
                hasItems,
            },
            refreshCartIndicator,
            getEstimatedCart,
            addToCart,
            removeLineItems,
            updateLineItemQuantity,
            clearCart,
            applyCoupon,
            removeCoupon,
            loadCategoryProducts,
        };
    });
    
    console.log('[wix-stores] Client stores context initialized (reactive)');
    return storesContext;
}
