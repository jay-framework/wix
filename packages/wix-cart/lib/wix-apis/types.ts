/**
 * Wix eCommerce Cart types.
 * Copied and simplified from @wix/auto_sdk_ecom_current-cart.
 */

export interface Cart {
    _id?: string;
    lineItems?: LineItem[];
    buyerInfo?: BuyerInfo;
    currency?: string;
    subtotal?: CartAmount;
    appliedDiscount?: CartDiscount;
    [key: string]: any;
}

export interface LineItem {
    _id?: string;
    quantity?: number;
    catalogReference?: CatalogReference;
    productName?: ProductName;
    url?: string;
    price?: CartAmount;
    fullPrice?: CartAmount;
    priceBeforeDiscounts?: CartAmount;
    lineItemPrice?: CartAmount;
    descriptionLines?: DescriptionLine[];
    image?: string;
    availability?: Availability;
    physicalProperties?: PhysicalProperties;
    couponScopes?: Array<{ namespace?: string; group?: { name?: string; entityId?: string } }>;
    itemType?: ItemType;
    paymentOption?: string;
    [key: string]: unknown;
}

export interface CatalogReference {
    catalogItemId?: string;
    appId?: string;
    options?: Record<string, any>;
}

export interface ProductName {
    original?: string;
    translated?: string;
}

export interface CartAmount {
    amount?: string;
    convertedAmount?: string;
    formattedAmount?: string;
    formattedConvertedAmount?: string;
}

export interface CartDiscount {
    coupon?: { _id?: string; code?: string; amount?: CartAmount; name?: string };
    discountRule?: any;
}

export interface DescriptionLine {
    name?: ProductName;
    plainText?: ProductName;
    colorInfo?: { original?: string; translated?: string; code?: string };
}

export interface BuyerInfo {
    visitorId?: string;
    memberId?: string;
    contactId?: string;
}

export interface Availability {
    status?: string;
    quantityAvailable?: number;
}

export interface PhysicalProperties {
    weight?: number;
    sku?: string;
    shippable?: boolean;
}

export interface ItemType {
    preset?: string;
    custom?: string;
}

// Response types

export interface GetCurrentCartResponse {
    cart?: Cart;
}

export interface AddToCurrentCartResponse {
    cart?: Cart;
}

export interface RemoveLineItemsResponse {
    cart?: Cart;
}

export interface UpdateLineItemQuantityResponse {
    cart?: Cart;
}

export interface UpdateCurrentCartResponse extends Cart {}

export interface RemoveCouponResponse {
    cart?: Cart;
}

export interface EstimateCurrentCartTotalsResponse {
    cart?: Cart;
    calculatedLineItems?: CalculatedLineItem[];
    priceSummary?: PriceSummary;
    appliedDiscounts?: any[];
    [key: string]: any;
}

export interface CalculatedLineItem {
    lineItemId?: string;
    pricesBreakdown?: PriceBreakdown;
    [key: string]: any;
}

export interface PriceBreakdown {
    totalPriceAfterTax?: CartAmount;
    totalPriceBeforeTax?: CartAmount;
    totalDiscount?: CartAmount;
    price?: CartAmount;
    priceBeforeDiscounts?: CartAmount;
    lineItemPrice?: CartAmount;
    tax?: CartAmount;
    [key: string]: any;
}

export interface PriceSummary {
    subtotal?: CartAmount;
    total?: CartAmount;
    shipping?: CartAmount;
    tax?: CartAmount;
    discount?: CartAmount;
    [key: string]: any;
}
