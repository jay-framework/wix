import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface LoginFormViewState {
  isSubmitting: boolean,
  errorMessage: string,
  hasError: boolean,
  resetSent: boolean
}

export type LoginFormSlowViewState = {};

export type LoginFormFastViewState = Pick<LoginFormViewState, 'isSubmitting' | 'errorMessage' | 'hasError' | 'resetSent'>;

export type LoginFormInteractiveViewState = Pick<LoginFormViewState, 'isSubmitting' | 'errorMessage' | 'hasError' | 'resetSent'>;


export interface LoginFormRefs {
  emailInput: HTMLElementProxy<LoginFormViewState, HTMLInputElement>,
  passwordInput: HTMLElementProxy<LoginFormViewState, HTMLInputElement>,
  submitButton: HTMLElementProxy<LoginFormViewState, HTMLButtonElement>,
  forgotPasswordButton: HTMLElementProxy<LoginFormViewState, HTMLButtonElement>
}


export interface LoginFormRepeatedRefs {
  emailInput: HTMLElementCollectionProxy<LoginFormViewState, HTMLInputElement>,
  passwordInput: HTMLElementCollectionProxy<LoginFormViewState, HTMLInputElement>,
  submitButton: HTMLElementCollectionProxy<LoginFormViewState, HTMLButtonElement>,
  forgotPasswordButton: HTMLElementCollectionProxy<LoginFormViewState, HTMLButtonElement>
}

export type LoginFormContract = JayContract<LoginFormViewState, LoginFormRefs, LoginFormSlowViewState, LoginFormFastViewState, LoginFormInteractiveViewState>