import {JayContract} from "@jay-framework/runtime";


export interface AuthCallbackViewState {
  isProcessing: boolean,
  hasError: boolean,
  errorMessage: string
}

export type AuthCallbackSlowViewState = {};

export type AuthCallbackFastViewState = Pick<AuthCallbackViewState, 'isProcessing' | 'hasError' | 'errorMessage'>;

export type AuthCallbackInteractiveViewState = Pick<AuthCallbackViewState, 'isProcessing' | 'hasError' | 'errorMessage'>;

export interface AuthCallbackRefs {}

export interface AuthCallbackRepeatedRefs {}

export type AuthCallbackContract = JayContract<AuthCallbackViewState, AuthCallbackRefs, AuthCallbackSlowViewState, AuthCallbackFastViewState, AuthCallbackInteractiveViewState>