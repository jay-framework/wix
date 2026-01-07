import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface ImageOfLineItemOfCartPageViewState {
  url: string,
  altText: string
}

export interface UnitPriceOfLineItemOfCartPageViewState {
  amount: string,
  formattedAmount: string
}

export interface LineTotalOfLineItemOfCartPageViewState {
  amount: string,
  formattedAmount: string
}

export interface LineDiscountOfLineItemOfCartPageViewState {
  amount: string,
  formattedAmount: string
}

export interface LineItemOfCartPageViewState {
  lineItemId: string,
  productId: string,
  productName: string,
  productUrl: string,
  variantName: string,
  sku: string,
  image: ImageOfLineItemOfCartPageViewState,
  quantity: number,
  isUpdatingQuantity: boolean,
  unitPrice: UnitPriceOfLineItemOfCartPageViewState,
  lineTotal: LineTotalOfLineItemOfCartPageViewState,
  lineDiscount: LineDiscountOfLineItemOfCartPageViewState,
  hasDiscount: boolean,
  isRemoving: boolean
}

export interface SubtotalOfSummaryOfCartPageViewState {
  amount: string,
  formattedAmount: string
}

export interface DiscountOfSummaryOfCartPageViewState {
  amount: string,
  formattedAmount: string
}

export interface EstimatedTaxOfSummaryOfCartPageViewState {
  amount: string,
  formattedAmount: string
}

export interface EstimatedTotalOfSummaryOfCartPageViewState {
  amount: string,
  formattedAmount: string
}

export interface SummaryOfCartPageViewState {
  itemCount: number,
  subtotal: SubtotalOfSummaryOfCartPageViewState,
  discount: DiscountOfSummaryOfCartPageViewState,
  hasDiscount: boolean,
  estimatedTax: EstimatedTaxOfSummaryOfCartPageViewState,
  showTax: boolean,
  estimatedTotal: EstimatedTotalOfSummaryOfCartPageViewState,
  currency: string
}

export interface CouponOfCartPageViewState {
  code: string,
  isApplying: boolean,
  appliedCode: string,
  hasAppliedCoupon: boolean,
  errorMessage: string,
  hasError: boolean
}

export interface CartPageViewState {
  cartId: string,
  isEmpty: boolean,
  isLoading: boolean,
  lineItems: Array<LineItemOfCartPageViewState>,
  summary: SummaryOfCartPageViewState,
  coupon: CouponOfCartPageViewState,
  isCheckingOut: boolean,
  emptyCartMessage: string
}

export type CartPageSlowViewState = Pick<CartPageViewState, 'cartId' | 'emptyCartMessage'>;

export type CartPageFastViewState = Pick<CartPageViewState, 'isEmpty' | 'isLoading' | 'isCheckingOut'> & {
    lineItems: Array<Pick<CartPageViewState['lineItems'][number], 'lineItemId' | 'productId' | 'productName' | 'productUrl' | 'variantName' | 'sku' | 'quantity' | 'isUpdatingQuantity' | 'hasDiscount' | 'isRemoving'> & {
    image: CartPageViewState['lineItems'][number]['image'];
    unitPrice: CartPageViewState['lineItems'][number]['unitPrice'];
    lineTotal: CartPageViewState['lineItems'][number]['lineTotal'];
    lineDiscount: CartPageViewState['lineItems'][number]['lineDiscount'];
}>;
    summary: Pick<CartPageViewState['summary'], 'itemCount' | 'hasDiscount' | 'showTax' | 'currency'> & {
    subtotal: CartPageViewState['summary']['subtotal'];
    discount: CartPageViewState['summary']['discount'];
    estimatedTax: CartPageViewState['summary']['estimatedTax'];
    estimatedTotal: CartPageViewState['summary']['estimatedTotal'];
};
    coupon: CartPageViewState['coupon'];
};

export type CartPageInteractiveViewState = Pick<CartPageViewState, 'isEmpty' | 'isLoading' | 'isCheckingOut'> & {
    lineItems: Array<Pick<CartPageViewState['lineItems'][number], 'lineItemId' | 'productId' | 'productName' | 'productUrl' | 'variantName' | 'sku' | 'quantity' | 'isUpdatingQuantity' | 'hasDiscount' | 'isRemoving'> & {
    image: CartPageViewState['lineItems'][number]['image'];
    unitPrice: CartPageViewState['lineItems'][number]['unitPrice'];
    lineTotal: CartPageViewState['lineItems'][number]['lineTotal'];
    lineDiscount: CartPageViewState['lineItems'][number]['lineDiscount'];
}>;
    summary: Pick<CartPageViewState['summary'], 'itemCount' | 'hasDiscount' | 'showTax' | 'currency'> & {
    subtotal: CartPageViewState['summary']['subtotal'];
    discount: CartPageViewState['summary']['discount'];
    estimatedTax: CartPageViewState['summary']['estimatedTax'];
    estimatedTotal: CartPageViewState['summary']['estimatedTotal'];
};
    coupon: CartPageViewState['coupon'];
};


export interface CartPageRefs {
  checkoutButton: HTMLElementProxy<CartPageViewState, HTMLButtonElement>,
  continueShoppingLink: HTMLElementProxy<CartPageViewState, HTMLAnchorElement>,
  clearCartButton: HTMLElementProxy<CartPageViewState, HTMLButtonElement>,
  emptyCartLink: HTMLElementProxy<CartPageViewState, HTMLAnchorElement>,
  lineItems: {
    productLink: HTMLElementCollectionProxy<LineItemOfCartPageViewState, HTMLAnchorElement>,
    quantity: HTMLElementCollectionProxy<LineItemOfCartPageViewState, HTMLInputElement>,
    decrementButton: HTMLElementCollectionProxy<LineItemOfCartPageViewState, HTMLButtonElement>,
    incrementButton: HTMLElementCollectionProxy<LineItemOfCartPageViewState, HTMLButtonElement>,
    removeButton: HTMLElementCollectionProxy<LineItemOfCartPageViewState, HTMLButtonElement>
  },
  coupon: {
    code: HTMLElementProxy<CouponOfCartPageViewState, HTMLInputElement>,
    applyButton: HTMLElementProxy<CouponOfCartPageViewState, HTMLButtonElement>,
    removeButton: HTMLElementProxy<CouponOfCartPageViewState, HTMLButtonElement>
  }
}


export interface CartPageRepeatedRefs {
  checkoutButton: HTMLElementCollectionProxy<CartPageViewState, HTMLButtonElement>,
  continueShoppingLink: HTMLElementCollectionProxy<CartPageViewState, HTMLAnchorElement>,
  clearCartButton: HTMLElementCollectionProxy<CartPageViewState, HTMLButtonElement>,
  emptyCartLink: HTMLElementCollectionProxy<CartPageViewState, HTMLAnchorElement>,
  lineItems: {
    productLink: HTMLElementCollectionProxy<LineItemOfCartPageViewState, HTMLAnchorElement>,
    quantity: HTMLElementCollectionProxy<LineItemOfCartPageViewState, HTMLInputElement>,
    decrementButton: HTMLElementCollectionProxy<LineItemOfCartPageViewState, HTMLButtonElement>,
    incrementButton: HTMLElementCollectionProxy<LineItemOfCartPageViewState, HTMLButtonElement>,
    removeButton: HTMLElementCollectionProxy<LineItemOfCartPageViewState, HTMLButtonElement>
  },
  coupon: {
    code: HTMLElementCollectionProxy<CouponOfCartPageViewState, HTMLInputElement>,
    applyButton: HTMLElementCollectionProxy<CouponOfCartPageViewState, HTMLButtonElement>,
    removeButton: HTMLElementCollectionProxy<CouponOfCartPageViewState, HTMLButtonElement>
  }
}

export type CartPageContract = JayContract<CartPageViewState, CartPageRefs, CartPageSlowViewState, CartPageFastViewState, CartPageInteractiveViewState>