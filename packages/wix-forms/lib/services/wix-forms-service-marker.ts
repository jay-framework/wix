import { createJayService } from '@jay-framework/fullstack-component';
import type { WixFormsSiteCatalog } from '../site-forms-catalog.js';
import type { FormFieldSummaryView, FormFieldView } from '../types.js';

export interface WixFormsService {
    catalog: WixFormsSiteCatalog;
    getFormFields(formId: string): Promise<FormFieldView[]>;
    getFormDisplayName(formId: string): Promise<string | undefined>;
    getFormSummaryFields(formId?: string): Promise<FormFieldSummaryView[]>;
    createSubmission(formId: string, values: Record<string, string>): Promise<void>;
}

export const WIX_FORMS_SERVICE = createJayService<WixFormsService>('WixFormsService');
