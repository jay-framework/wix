import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface RegisterFormViewState {
  isSubmitting: boolean,
  errorMessage: string,
  hasError: boolean,
  isPending: boolean,
  isSuccess: boolean
}

export type RegisterFormSlowViewState = {};

export type RegisterFormFastViewState = Pick<RegisterFormViewState, 'isSubmitting' | 'errorMessage' | 'hasError' | 'isPending' | 'isSuccess'>;

export type RegisterFormInteractiveViewState = Pick<RegisterFormViewState, 'isSubmitting' | 'errorMessage' | 'hasError' | 'isPending' | 'isSuccess'>;


export interface RegisterFormRefs {
  emailInput: HTMLElementProxy<RegisterFormViewState, HTMLInputElement>,
  passwordInput: HTMLElementProxy<RegisterFormViewState, HTMLInputElement>,
  firstNameInput: HTMLElementProxy<RegisterFormViewState, HTMLInputElement>,
  lastNameInput: HTMLElementProxy<RegisterFormViewState, HTMLInputElement>,
  submitButton: HTMLElementProxy<RegisterFormViewState, HTMLButtonElement>
}


export interface RegisterFormRepeatedRefs {
  emailInput: HTMLElementCollectionProxy<RegisterFormViewState, HTMLInputElement>,
  passwordInput: HTMLElementCollectionProxy<RegisterFormViewState, HTMLInputElement>,
  firstNameInput: HTMLElementCollectionProxy<RegisterFormViewState, HTMLInputElement>,
  lastNameInput: HTMLElementCollectionProxy<RegisterFormViewState, HTMLInputElement>,
  submitButton: HTMLElementCollectionProxy<RegisterFormViewState, HTMLButtonElement>
}

export type RegisterFormContract = JayContract<RegisterFormViewState, RegisterFormRefs, RegisterFormSlowViewState, RegisterFormFastViewState, RegisterFormInteractiveViewState>