/**
 * Cart Helper Types and Functions
 * 
 * Shared types and mappers for cart operations.
 * Used by both context and components.
 */

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

// ============================================================================
// Helper Functions
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WixCart = any;

/**
 * Map cart line item from Wix API to our format
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapLineItem(item: any): CartLineItem {
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
export function mapCartSummary(cart: WixCart): CartSummary {
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
export function mapCartToState(cart: WixCart): CartState {
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
export function getEmptyCartState(): CartState {
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

/**
 * Map cart to indicator state (lightweight)
 */
export function mapCartToIndicator(cart: WixCart): CartIndicatorState {
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
}

