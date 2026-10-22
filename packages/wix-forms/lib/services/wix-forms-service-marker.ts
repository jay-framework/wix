import { createJayService } from '@jay-framework/fullstack-component';
import type { WixFormsConfig } from '../config-loader.js';
import type { FormFieldSummaryView, FormFieldView, ListedFormView } from '../types.js';

export interface WixFormsService {
    /** Plugin configuration (namespace / formIds / include filter). */
    config: WixFormsConfig;
    /**
     * Enumerate every form in the configured namespace (build time), each with
     * its projected visible fields. Cached for the build process so List runs
     * once and is shared by the generator and the agent-kit reference (DL#38).
     */
    listForms(): Promise<ListedFormView[]>;
    /** Load one form's fields by id (runtime slow phase). */
    getFormFields(formId: string): Promise<FormFieldView[]>;
    getFormSummaryFields(formId?: string): Promise<FormFieldSummaryView[]>;
    createSubmission(formId: string, values: Record<string, string>): Promise<void>;
}

export const WIX_FORMS_SERVICE = createJayService<WixFormsService>('WixFormsService');
