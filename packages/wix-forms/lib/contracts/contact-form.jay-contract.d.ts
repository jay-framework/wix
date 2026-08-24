import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface FieldOfContactFormViewState {
  target: string,
  label: string,
  inputType: string,
  isTextarea: boolean,
  required: boolean,
  placeholder: string,
  hasOptions: boolean
}

export interface OptionOfContactFormViewState {
  id: string,
  fieldTarget: string,
  value: string,
  label: string
}

export interface FieldErrorOfContactFormViewState {
  target: string,
  errorMessage: string
}

export interface ContactFormViewState {
  fields: Array<FieldOfContactFormViewState>,
  options: Array<OptionOfContactFormViewState>,
  isLoading: boolean,
  loadError: string,
  isSubmitting: boolean,
  statusMessage: string,
  fieldErrors: Array<FieldErrorOfContactFormViewState>
}

export type ContactFormSlowViewState = {};

export type ContactFormFastViewState = Pick<ContactFormViewState, 'isLoading' | 'loadError' | 'isSubmitting' | 'statusMessage'> & {
    fields: Array<ContactFormViewState['fields'][number]>;
    options: Array<ContactFormViewState['options'][number]>;
    fieldErrors: Array<ContactFormViewState['fieldErrors'][number]>;
};

export type ContactFormInteractiveViewState = Pick<ContactFormViewState, 'isLoading' | 'loadError' | 'isSubmitting' | 'statusMessage'> & {
    fields: Array<ContactFormViewState['fields'][number]>;
    options: Array<ContactFormViewState['options'][number]>;
    fieldErrors: Array<ContactFormViewState['fieldErrors'][number]>;
};


export interface ContactFormRefs {
  submitButton: HTMLElementProxy<ContactFormViewState, HTMLButtonElement>,
  fields: {
    formInputs: HTMLElementCollectionProxy<FieldOfContactFormViewState, HTMLInputElement>,
    formTextareas: HTMLElementCollectionProxy<FieldOfContactFormViewState, HTMLTextAreaElement>,
    formSelects: HTMLElementCollectionProxy<FieldOfContactFormViewState, HTMLSelectElement>
  }
}


export interface ContactFormRepeatedRefs {
  submitButton: HTMLElementCollectionProxy<ContactFormViewState, HTMLButtonElement>,
  fields: {
    formInputs: HTMLElementCollectionProxy<FieldOfContactFormViewState, HTMLInputElement>,
    formTextareas: HTMLElementCollectionProxy<FieldOfContactFormViewState, HTMLTextAreaElement>,
    formSelects: HTMLElementCollectionProxy<FieldOfContactFormViewState, HTMLSelectElement>
  }
}

export interface ContactFormProps {
  formId?: string;
}

export type ContactFormContract = JayContract<ContactFormViewState, ContactFormRefs, ContactFormSlowViewState, ContactFormFastViewState, ContactFormInteractiveViewState, ContactFormProps>
