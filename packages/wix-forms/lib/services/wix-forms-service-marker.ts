import { createJayService } from '@jay-framework/fullstack-component';
import type { FormFieldSummaryView, FormFieldView } from '../types.js';

export interface WixFormsService {
    getFormFields(formId: string): Promise<FormFieldView[]>;
    getFormSummaryFields(formId?: string): Promise<FormFieldSummaryView[]>;
    createSubmission(formId: string, values: Record<string, string>): Promise<void>;
}

export const WIX_FORMS_SERVICE = createJayService<WixFormsService>('WixFormsService');
