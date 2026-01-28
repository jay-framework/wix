import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface CartIndicatorViewState {
  itemCount: number,
  hasItems: boolean,
  isLoading: boolean,
  justAdded: boolean
}

export type CartIndicatorSlowViewState = {};

export type CartIndicatorFastViewState = Pick<CartIndicatorViewState, 'itemCount' | 'hasItems' | 'isLoading' | 'justAdded'>;

export type CartIndicatorInteractiveViewState = Pick<CartIndicatorViewState, 'itemCount' | 'hasItems' | 'isLoading' | 'justAdded'>;


export interface CartIndicatorRefs {
  cartButton: HTMLElementProxy<CartIndicatorViewState, HTMLButtonElement>,
  cartLink: HTMLElementProxy<CartIndicatorViewState, HTMLAnchorElement>
}


export interface CartIndicatorRepeatedRefs {
  cartButton: HTMLElementCollectionProxy<CartIndicatorViewState, HTMLButtonElement>,
  cartLink: HTMLElementCollectionProxy<CartIndicatorViewState, HTMLAnchorElement>
}

export type CartIndicatorContract = JayContract<CartIndicatorViewState, CartIndicatorRefs, CartIndicatorSlowViewState, CartIndicatorFastViewState, CartIndicatorInteractiveViewState>