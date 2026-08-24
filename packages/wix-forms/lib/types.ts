export type FormFieldInputType = 'text' | 'email' | 'tel' | 'url' | 'textarea' | 'select';

export interface FormFieldOptionView {
    value: string;
    label: string;
}

export interface ContactFormFieldView {
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
