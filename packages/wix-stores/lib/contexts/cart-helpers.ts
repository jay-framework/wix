/**
 * Cart Helper Types and Functions
 * 
 * Shared types and mappers for cart operations.
 * Used by both context and components.
 */

import type { currentCart } from '@wix/ecom';
import type {
    Cart,
    LineItem,
    CartDiscount
} from '@wix/auto_sdk_ecom_current-cart';
import { formatWixMediaUrl } from '../utils/product-mapper';

// ============================================================================
// Types
// ============================================================================

type CurrentCartClient = typeof currentCart;

// Get the return type of estimateCurrentCartTotals
// The client method returns a Promise, so we need to unwrap it
type EstimateMethod = CurrentCartClient['estimateCurrentCartTotals'];
type EstimateTotalsResult = Awaited<ReturnType<ReturnType<EstimateMethod>>>;

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
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map cart line item from Wix API to our format
 */
export function mapLineItem(item: LineItem): CartLineItem {
    const catalogRef = item.catalogReference;
    const physicalProperties = item.physicalProperties;
    const priceData = item.price;
    const descriptionLines = item.descriptionLines || [];
    
    // Build variant description from options
    const variantParts = descriptionLines
        .filter(line => line.name?.translated)
        .map(line => 
            `${line.name?.translated}: ${line.colorInfo?.translated || line.plainText?.translated || ''}`
        );

    return {
        lineItemId: item._id || '',
        productId: catalogRef?.catalogItemId || '',
        productName: item.productName?.translated || item.productName?.original || '',
        productUrl: `/products/${item.url || catalogRef?.catalogItemId || ''}`,
        variantName: variantParts.join(' / '),
        sku: physicalProperties?.sku || '',
        image: {
            url: formatWixMediaUrl('', item.image || ''),
            altText: item.productName?.translated || ''
        },
        quantity: item.quantity || 1,
        unitPrice: {
            amount: priceData?.amount || '0',
            formattedAmount: priceData?.formattedAmount || ''
        },
        lineTotal: {
            amount: item.lineItemPrice?.amount || '0',
            formattedAmount: item.lineItemPrice?.formattedAmount || ''
        },
        lineDiscount: {
            amount: '0',
            formattedAmount: ''
        },
        hasDiscount: false
    };
}

/**
 * Calculate total discount from cart discounts (merchantDiscount has amount)
 */
function calculateTotalDiscount(appliedDiscounts: CartDiscount[] | undefined): number {
    if (!appliedDiscounts) return 0;
    return appliedDiscounts.reduce(
        (sum, d) => sum + parseFloat(d.merchantDiscount?.amount?.amount || '0'),
        0
    );
}

/**
 * Calculate item count from line items
 */
function calculateItemCount(lineItems: LineItem[] | undefined): number {
    if (!lineItems) return 0;
    return lineItems.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
    );
}

/**
 * Get empty summary
 */
function getEmptySummary(): CartSummary {
    return {
        itemCount: 0,
        subtotal: { amount: '0', formattedAmount: '$0.00' },
        discount: { amount: '0', formattedAmount: '' },
        hasDiscount: false,
        estimatedTax: { amount: '0', formattedAmount: '' },
        showTax: false,
        estimatedTotal: { amount: '0', formattedAmount: '$0.00' },
        currency: 'USD'
    };
}

/**
 * Map cart to our summary format (basic - without estimate totals)
 */
export function mapCartSummary(cart: Cart | null): CartSummary {
    if (!cart) {
        return getEmptySummary();
    }
    
    const totalDiscount = calculateTotalDiscount(cart.appliedDiscounts);
    const itemCount = calculateItemCount(cart.lineItems);

    return {
        itemCount,
        subtotal: {
            amount: '0',
            formattedAmount: '$0.00'
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
        showTax: false,
        estimatedTotal: {
            amount: '0',
            formattedAmount: '$0.00'
        },
        currency: cart.currency || 'USD'
    };
}

/**
 * Map cart to full state (basic - without estimate totals)
 */
export function mapCartToState(cart: Cart | null): CartState {
    if (!cart) {
        return getEmptyCartState();
    }
    
    const lineItems = (cart.lineItems || []).map(mapLineItem);
    const appliedCoupon = cart.appliedDiscounts?.find(
        d => d.coupon?.code
    )?.coupon?.code || '';

    return {
        cartId: cart._id || '',
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
export function getEmptyCartState(): CartState {
    return {
        cartId: '',
        isEmpty: true,
        lineItems: [],
        summary: getEmptySummary(),
        appliedCoupon: '',
        hasAppliedCoupon: false
    };
}

/**
 * Map cart to indicator state (lightweight)
 */
export function mapCartToIndicator(cart: Cart | null): CartIndicatorState {
    if (!cart || !cart.lineItems?.length) {
        return {
            itemCount: 0,
            hasItems: false
        };
    }

    const itemCount = calculateItemCount(cart.lineItems);

    return {
        itemCount,
        hasItems: itemCount > 0
    };
}

// ============================================================================
// API Helpers
// ============================================================================

interface ErrorWithDetails {
    response?: { status?: number };
    status?: number;
    code?: number;
    message?: string;
}

/**
 * Check if an error is a 404 "cart not found" error.
 * The Wix Cart API returns 404 when no cart exists yet (before first item is added).
 */
function isCartNotFoundError(error: unknown): boolean {
    const err = error as ErrorWithDetails;
    // Check for HTTP 404 status
    if (err?.response?.status === 404) return true;
    if (err?.status === 404) return true;
    if (err?.code === 404) return true;
    // Check for error message patterns
    const message = err?.message?.toLowerCase() || '';
    if (message.includes('not found') && message.includes('cart')) return true;
    return false;
}

/**
 * Get the current cart, treating 404 as an empty cart.
 * 
 * The Wix Cart API returns 404 when no cart exists (before first item is added).
 * This helper normalizes that case to return null, which the mappers handle as empty.
 */
export async function getCurrentCartOrNull(
    cartClient: CurrentCartClient
): Promise<Cart | null> {
    try {
        const response = await cartClient.getCurrentCart();
        return response ?? null;
    } catch (error) {
        if (isCartNotFoundError(error)) {
            return null;
        }
        throw error;
    }
}

/**
 * Estimate the current cart totals, treating 404 as an empty cart.
 * 
 * This API provides complete price totals including tax calculations.
 * Use this for cart pages where accurate totals are needed.
 * 
 * @see https://dev.wix.com/docs/sdk/backend-modules/ecom/current-cart/estimate-current-cart-totals
 */
export async function estimateCurrentCartTotalsOrNull(
    cartClient: CurrentCartClient
): Promise<EstimateTotalsResult | null> {
    try {
        const response = await cartClient.estimateCurrentCartTotals({});
        return response ?? null;
    } catch (error) {
        if (isCartNotFoundError(error)) {
            return null;
        }
        throw error;
    }
}

/**
 * Map estimate totals response to CartState.
 * The estimate response includes calculated totals with tax.
 */
export function mapEstimateTotalsToState(estimate: EstimateTotalsResult | null): CartState {
    if (!estimate?.cart) {
        return getEmptyCartState();
    }

    const cart = estimate.cart;
    const lineItems = (cart.lineItems || []).map(mapLineItem);
    const appliedCoupon = cart.appliedDiscounts?.find(
        d => d.coupon?.code
    )?.coupon?.code || '';

    const itemCount = lineItems.reduce((sum, item) => sum + item.quantity, 0);

    // Extract totals from priceSummary (more accurate)
    const priceSummary = estimate.priceSummary;
    const taxSummary = estimate.taxSummary;
    
    // Use priceSummary.discount which gives us the total discount amount
    const discountAmount = parseFloat(priceSummary?.discount?.amount || '0');
    const hasTax = parseFloat(taxSummary?.totalTax?.amount || '0') > 0;

    return {
        cartId: cart._id || '',
        isEmpty: lineItems.length === 0,
        lineItems,
        summary: {
            itemCount,
            subtotal: {
                amount: priceSummary?.subtotal?.amount || '0',
                formattedAmount: priceSummary?.subtotal?.formattedAmount || '$0.00'
            },
            discount: {
                amount: discountAmount.toString(),
                formattedAmount: priceSummary?.discount?.formattedAmount || ''
            },
            hasDiscount: discountAmount > 0,
            estimatedTax: {
                amount: taxSummary?.totalTax?.amount || '0',
                formattedAmount: taxSummary?.totalTax?.formattedAmount || ''
            },
            showTax: hasTax,
            estimatedTotal: {
                amount: priceSummary?.total?.amount || priceSummary?.subtotal?.amount || '0',
                formattedAmount: priceSummary?.total?.formattedAmount || priceSummary?.subtotal?.formattedAmount || '$0.00'
            },
            currency: cart.currency || 'USD'
        },
        appliedCoupon,
        hasAppliedCoupon: !!appliedCoupon
    };
}
