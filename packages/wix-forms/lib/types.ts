export type FormFieldInputType = 'text' | 'email' | 'tel' | 'url' | 'textarea' | 'select';

export interface FormFieldOptionView {
    value: string;
    label: string;
}

export interface FormFieldView {
    target: string;
    label: string;
    inputType: FormFieldInputType;
    required: boolean;
    placeholder: string;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    options: FormFieldOptionView[];
}

export interface FormFieldSummaryView {
    target: string;
    label: string;
    type: 'STRING' | 'EMAIL' | 'PHONE' | 'NUMBER' | 'URL';
    required: boolean;
}

export interface FormFieldErrorView {
    target: string;
    errorMessage: string;
}

/** A form enumerated at build time, with its projected visible fields (DL#36). */
export interface ListedFormView {
    id: string;
    name: string;
    fields: FormFieldView[];
}
