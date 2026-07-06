import {JayContract} from "@jay-framework/runtime";


export interface ProtectedPageViewState {
  isLoggedIn: boolean
}

export type ProtectedPageSlowViewState = {};

export type ProtectedPageFastViewState = Pick<ProtectedPageViewState, 'isLoggedIn'>;

export type ProtectedPageInteractiveViewState = Pick<ProtectedPageViewState, 'isLoggedIn'>;

export interface ProtectedPageRefs {}

export interface ProtectedPageRepeatedRefs {}

export interface ProtectedPageProps {
  loginUrl?: string;
}

export type ProtectedPageContract = JayContract<ProtectedPageViewState, ProtectedPageRefs, ProtectedPageSlowViewState, ProtectedPageFastViewState, ProtectedPageInteractiveViewState, ProtectedPageProps>