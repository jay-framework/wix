/**
 * Cart Actions for Wix Stores
 *
 * Provides RPC-style actions for client-side code to interact with the
 * Wix eCommerce Current Cart API.
 */

import { makeJayAction, makeJayQuery, ActionError } from '@jay-framework/fullstack-component';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from './stores-client/wix-stores-service';

// ============================================================================
// Types
// ============================================================================

/**
 * Cart line item for display
 */
export interface CartLineItem {
    lineItemId: string;
    productId: string;
    productName: string;
    productUrl: string;
    variantName: string;
    sku: string;
    image: {
        url: string;
        altText: string;
    };
    quantity: number;
    unitPrice: {
        amount: string;
        formattedAmount: string;
    };
    lineTotal: {
        amount: string;
        formattedAmount: string;
    };
    lineDiscount: {
        amount: string;
        formattedAmount: string;
    };
    hasDiscount: boolean;
}

/**
 * Cart summary for display
 */
export interface CartSummary {
    itemCount: number;
    subtotal: {
        amount: string;
        formattedAmount: string;
    };
    discount: {
        amount: string;
        formattedAmount: string;
    };
    hasDiscount: boolean;
    estimatedTax: {
        amount: string;
        formattedAmount: string;
    };
    showTax: boolean;
    estimatedTotal: {
        amount: string;
        formattedAmount: string;
    };
    currency: string;
}

/**
 * Full cart state
 */
export interface CartState {
    cartId: string;
    isEmpty: boolean;
    lineItems: CartLineItem[];
    summary: CartSummary;
    appliedCoupon: string;
    hasAppliedCoupon: boolean;
}

/**
 * Cart indicator data (lightweight)
 */
export interface CartIndicatorState {
    itemCount: number;
    hasItems: boolean;
    subtotal: {
        amount: string;
        formattedAmount: string;
        currency: string;
    };
}

/**
 * Input for adding item to cart
 */
export interface AddToCartInput {
    /** Catalog product ID */
    productId: string;
    /** Quantity to add */
    quantity?: number;
    /** Optional variant choices */
    options?: Record<string, string>;
}

/**
 * Input for updating line item quantity
 */
export interface UpdateQuantityInput {
    /** Line item ID in cart */
    lineItemId: string;
    /** New quantity */
    quantity: number;
}

/**
 * Input for removing item from cart
 */
export interface RemoveItemInput {
    /** Line item ID to remove */
    lineItemId: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WixCart = any;

/**
 * Map cart line item from Wix API to our format
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLineItem(item: any): CartLineItem {
    const catalogRef = item.catalogReference || {};
    const physicalProperties = item.physicalProperties || {};
    const media = item.image || item.media?.mainMedia?.image || {};
    const priceData = item.price || {};
    const descriptionLines = item.descriptionLines || [];
    
    // Build variant description from options
    const variantParts = descriptionLines
        .filter((line: { name?: { translated?: string } }) => line.name?.translated)
        .map((line: { name?: { translated?: string }, colorInfo?: { translated?: string }, plainText?: { translated?: string } }) => 
            `${line.name?.translated}: ${line.colorInfo?.translated || line.plainText?.translated || ''}`
        );

    return {
        lineItemId: item._id || '',
        productId: catalogRef.catalogItemId || '',
        productName: item.productName?.translated || item.productName?.original || '',
        productUrl: `/products/${item.url?.relativePath || catalogRef.catalogItemId || ''}`,
        variantName: variantParts.join(' / '),
        sku: physicalProperties.sku || '',
        image: {
            url: media.url || '',
            altText: media.altText || item.productName?.translated || ''
        },
        quantity: item.quantity || 1,
        unitPrice: {
            amount: priceData.amount || '0',
            formattedAmount: priceData.formattedAmount || ''
        },
        lineTotal: {
            amount: item.lineItemPrice?.amount || '0',
            formattedAmount: item.lineItemPrice?.formattedAmount || ''
        },
        lineDiscount: {
            amount: item.discount?.amount || '0',
            formattedAmount: item.discount?.formattedAmount || ''
        },
        hasDiscount: parseFloat(item.discount?.amount || '0') > 0
    };
}

/**
 * Map cart to our summary format
 */
function mapCartSummary(cart: WixCart): CartSummary {
    const subtotal = cart?.subtotal || {};
    const appliedDiscounts = cart?.appliedDiscounts || [];
    const totalDiscount = appliedDiscounts.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: number, d: any) => sum + parseFloat(d.discountAmount?.amount || '0'), 
        0
    );
    
    const lineItems = cart?.lineItems || [];
    const itemCount = lineItems.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: number, item: any) => sum + (item.quantity || 0), 
        0
    );

    return {
        itemCount,
        subtotal: {
            amount: subtotal.amount || '0',
            formattedAmount: subtotal.formattedAmount || '$0.00'
        },
        discount: {
            amount: totalDiscount.toString(),
            formattedAmount: totalDiscount > 0 ? `-$${totalDiscount.toFixed(2)}` : ''
        },
        hasDiscount: totalDiscount > 0,
        estimatedTax: {
            amount: '0',
            formattedAmount: ''
        },
        showTax: false, // Tax calculated at checkout
        estimatedTotal: {
            amount: subtotal.amount || '0',
            formattedAmount: subtotal.formattedAmount || '$0.00'
        },
        currency: cart?.currency || 'USD'
    };
}

/**
 * Map cart to full state
 */
function mapCartToState(cart: WixCart): CartState {
    const lineItems = (cart?.lineItems || []).map(mapLineItem);
    const appliedCoupon = cart?.appliedDiscounts?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d: any) => d.coupon?.code
    )?.coupon?.code || '';

    return {
        cartId: cart?._id || '',
        isEmpty: lineItems.length === 0,
        lineItems,
        summary: mapCartSummary(cart),
        appliedCoupon,
        hasAppliedCoupon: !!appliedCoupon
    };
}

/**
 * Get empty cart state
 */
function getEmptyState(): CartState {
    return {
        cartId: '',
        isEmpty: true,
        lineItems: [],
        summary: {
            itemCount: 0,
            subtotal: { amount: '0', formattedAmount: '$0.00' },
            discount: { amount: '0', formattedAmount: '' },
            hasDiscount: false,
            estimatedTax: { amount: '0', formattedAmount: '' },
            showTax: false,
            estimatedTotal: { amount: '0', formattedAmount: '$0.00' },
            currency: 'USD'
        },
        appliedCoupon: '',
        hasAppliedCoupon: false
    };
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Get the current cart state.
 */
export const getCart = makeJayQuery('wixStores.getCart')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(async (
        _input: Record<string, never>,
        wixStores: WixStoresService
    ): Promise<CartState> => {
        try {
            // getCurrentCart() returns Cart directly
            const cart = await wixStores.cart.getCurrentCart();
            
            if (!cart) {
                return getEmptyState();
            }

            return mapCartToState(cart);
        } catch (error) {
            console.error('[wixStores.getCart] Failed to get cart:', error);
            throw new ActionError('CART_ERROR', 'Failed to load cart');
        }
    });

/**
 * Get cart indicator data (lightweight version for header display).
 */
export const getCartIndicator = makeJayQuery('wixStores.getCartIndicator')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(async (
        _input: Record<string, never>,
        wixStores: WixStoresService
    ): Promise<CartIndicatorState> => {
        try {
            // getCurrentCart() returns Cart directly
            const cart = await wixStores.cart.getCurrentCart();
            
            if (!cart || !cart.lineItems?.length) {
                return {
                    itemCount: 0,
                    hasItems: false,
                    subtotal: {
                        amount: '0',
                        formattedAmount: '$0.00',
                        currency: 'USD'
                    }
                };
            }

            const itemCount = cart.lineItems.reduce(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (sum: number, item: any) => sum + (item.quantity || 0), 
                0
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cartAny = cart as any;
            return {
                itemCount,
                hasItems: itemCount > 0,
                subtotal: {
                    amount: cartAny.subtotal?.amount || '0',
                    formattedAmount: cartAny.subtotal?.formattedAmount || '$0.00',
                    currency: cartAny.currency || 'USD'
                }
            };
        } catch (error) {
            console.error('[wixStores.getCartIndicator] Failed to get cart:', error);
            // Return empty state on error - don't break the page
            return {
                itemCount: 0,
                hasItems: false,
                subtotal: { amount: '0', formattedAmount: '$0.00', currency: 'USD' }
            };
        }
    });

/**
 * Add an item to the cart.
 */
export const addToCart = makeJayAction('wixStores.addToCart')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(async (
        input: AddToCartInput,
        wixStores: WixStoresService
    ): Promise<{ success: boolean; cart: CartState }> => {
        const { productId, quantity = 1, options } = input;

        if (!productId) {
            throw new ActionError('INVALID_INPUT', 'Product ID is required');
        }

        if (quantity < 1) {
            throw new ActionError('INVALID_INPUT', 'Quantity must be at least 1');
        }

        try {
            // Build catalog reference with options if provided
            const catalogReference: { 
                catalogItemId: string; 
                appId: string;
                options?: { variantId?: string; options?: Record<string, string> };
            } = {
                catalogItemId: productId,
                appId: '1380b703-ce81-ff05-f115-39571d94dfcd', // Wix Stores app ID
            };

            if (options && Object.keys(options).length > 0) {
                catalogReference.options = { options };
            }

            // addToCurrentCart returns AddToCartResponse with .cart property
            const result = await wixStores.cart.addToCurrentCart({
                lineItems: [{
                    catalogReference,
                    quantity
                }]
            });

            const cart = result.cart;
            return {
                success: true,
                cart: mapCartToState(cart)
            };
        } catch (error) {
            console.error('[wixStores.addToCart] Failed to add to cart:', error);
            throw new ActionError('CART_ERROR', 'Failed to add item to cart');
        }
    });

/**
 * Update the quantity of a line item in the cart.
 */
export const updateCartItemQuantity = makeJayAction('wixStores.updateCartItemQuantity')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(async (
        input: UpdateQuantityInput,
        wixStores: WixStoresService
    ): Promise<{ success: boolean; cart: CartState }> => {
        const { lineItemId, quantity } = input;

        if (!lineItemId) {
            throw new ActionError('INVALID_INPUT', 'Line item ID is required');
        }

        if (quantity < 0) {
            throw new ActionError('INVALID_INPUT', 'Quantity cannot be negative');
        }

        try {
            if (quantity === 0) {
                // Remove item if quantity is 0
                // removeLineItemsFromCurrentCart takes string[] directly
                const result = await wixStores.cart.removeLineItemsFromCurrentCart([lineItemId]);
                return {
                    success: true,
                    cart: mapCartToState(result.cart)
                };
            } else {
                // updateCurrentCartLineItemQuantity takes LineItemQuantityUpdate[] directly
                const result = await wixStores.cart.updateCurrentCartLineItemQuantity([
                    { _id: lineItemId, quantity }
                ]);
                return {
                    success: true,
                    cart: mapCartToState(result.cart)
                };
            }
        } catch (error) {
            console.error('[wixStores.updateCartItemQuantity] Failed to update quantity:', error);
            throw new ActionError('CART_ERROR', 'Failed to update quantity');
        }
    });

/**
 * Remove an item from the cart.
 */
export const removeFromCart = makeJayAction('wixStores.removeFromCart')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(async (
        input: RemoveItemInput,
        wixStores: WixStoresService
    ): Promise<{ success: boolean; cart: CartState }> => {
        const { lineItemId } = input;

        if (!lineItemId) {
            throw new ActionError('INVALID_INPUT', 'Line item ID is required');
        }

        try {
            // removeLineItemsFromCurrentCart takes string[] directly
            const result = await wixStores.cart.removeLineItemsFromCurrentCart([lineItemId]);
            return {
                success: true,
                cart: mapCartToState(result.cart)
            };
        } catch (error) {
            console.error('[wixStores.removeFromCart] Failed to remove item:', error);
            throw new ActionError('CART_ERROR', 'Failed to remove item');
        }
    });

/**
 * Clear all items from the cart.
 */
export const clearCart = makeJayAction('wixStores.clearCart')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(async (
        _input: Record<string, never>,
        wixStores: WixStoresService
    ): Promise<{ success: boolean }> => {
        try {
            // Get current cart to get all line item IDs
            const cart = await wixStores.cart.getCurrentCart();
            
            if (cart?.lineItems?.length) {
                const lineItemIds = cart.lineItems
                    .map((item: { _id?: string }) => item._id || '')
                    .filter(Boolean);
                if (lineItemIds.length > 0) {
                    await wixStores.cart.removeLineItemsFromCurrentCart(lineItemIds);
                }
            }

            return { success: true };
        } catch (error) {
            console.error('[wixStores.clearCart] Failed to clear cart:', error);
            throw new ActionError('CART_ERROR', 'Failed to clear cart');
        }
    });

/**
 * Remove the coupon from the cart.
 * Note: Coupon application requires the updateCurrentCart API with couponCode.
 * The currentCart API only supports removing coupons.
 */
export const removeCoupon = makeJayAction('wixStores.removeCoupon')
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withHandler(async (
        _input: Record<string, never>,
        wixStores: WixStoresService
    ): Promise<{ success: boolean; cart: CartState }> => {
        try {
            // removeCouponFromCurrentCart returns RemoveCouponResponse with .cart property
            const result = await wixStores.cart.removeCouponFromCurrentCart();
            return {
                success: true,
                cart: mapCartToState(result.cart)
            };
        } catch (error) {
            console.error('[wixStores.removeCoupon] Failed to remove coupon:', error);
            throw new ActionError('CART_ERROR', 'Failed to remove coupon');
        }
    });
