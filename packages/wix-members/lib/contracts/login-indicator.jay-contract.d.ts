import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface LoginIndicatorViewState {
  isLoggedIn: boolean,
  memberName: string,
  memberAvatar: string,
  isLoading: boolean
}

export type LoginIndicatorSlowViewState = {};

export type LoginIndicatorFastViewState = Pick<LoginIndicatorViewState, 'isLoggedIn' | 'memberName' | 'memberAvatar' | 'isLoading'>;

export type LoginIndicatorInteractiveViewState = Pick<LoginIndicatorViewState, 'isLoggedIn' | 'memberName' | 'memberAvatar' | 'isLoading'>;


export interface LoginIndicatorRefs {
  logoutButton: HTMLElementProxy<LoginIndicatorViewState, HTMLButtonElement>
}


export interface LoginIndicatorRepeatedRefs {
  logoutButton: HTMLElementCollectionProxy<LoginIndicatorViewState, HTMLButtonElement>
}

export type LoginIndicatorContract = JayContract<LoginIndicatorViewState, LoginIndicatorRefs, LoginIndicatorSlowViewState, LoginIndicatorFastViewState, LoginIndicatorInteractiveViewState>