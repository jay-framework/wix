import { createJayService } from '@jay-framework/fullstack-component';
import type { ContactFormFieldView, FormFieldSummaryView } from '../types.js';

export interface WixFormsService {
    getContactFormFields(formId: string): Promise<ContactFormFieldView[]>;
    getFormSummaryFields(formId?: string): Promise<FormFieldSummaryView[]>;
    createSubmission(formId: string, values: Record<string, string>): Promise<void>;
}

export const WIX_FORMS_SERVICE = createJayService<WixFormsService>('WixFormsService');
