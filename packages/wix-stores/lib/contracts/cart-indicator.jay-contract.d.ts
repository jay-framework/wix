import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface SubtotalOfCartIndicatorViewState {
  amount: string,
  formattedAmount: string,
  currency: string
}

export interface CartIndicatorViewState {
  itemCount: number,
  hasItems: boolean,
  subtotal: SubtotalOfCartIndicatorViewState,
  isLoading: boolean,
  justAdded: boolean
}

export type CartIndicatorSlowViewState = {};

export type CartIndicatorFastViewState = Pick<CartIndicatorViewState, 'itemCount' | 'hasItems' | 'isLoading' | 'justAdded'> & {
    subtotal: CartIndicatorViewState['subtotal'];
};

export type CartIndicatorInteractiveViewState = Pick<CartIndicatorViewState, 'itemCount' | 'hasItems' | 'isLoading' | 'justAdded'> & {
    subtotal: CartIndicatorViewState['subtotal'];
};


export interface CartIndicatorRefs {
  cartButton: HTMLElementProxy<CartIndicatorViewState, HTMLButtonElement>,
  cartLink: HTMLElementProxy<CartIndicatorViewState, HTMLAnchorElement>
}


export interface CartIndicatorRepeatedRefs {
  cartButton: HTMLElementCollectionProxy<CartIndicatorViewState, HTMLButtonElement>,
  cartLink: HTMLElementCollectionProxy<CartIndicatorViewState, HTMLAnchorElement>
}

export type CartIndicatorContract = JayContract<CartIndicatorViewState, CartIndicatorRefs, CartIndicatorSlowViewState, CartIndicatorFastViewState, CartIndicatorInteractiveViewState>