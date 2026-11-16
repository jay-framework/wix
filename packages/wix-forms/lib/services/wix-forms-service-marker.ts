import { createJayService } from '@jay-framework/fullstack-component';
import type { WixFormsConfig } from '../config-loader.js';
import type {
    FieldValue,
    FormFieldSummaryView,
    FormFieldView,
    ListedFormView,
    ProjectedForm,
} from '../types.js';
import type { RawForm } from '../wix-apis/get-form.js';

export interface WixFormsService {
    /** Plugin configuration (namespace / formIds / include filter). */
    config: WixFormsConfig;
    /**
     * Enumerate every form in the configured namespace (build time), each with
     * its projected visible fields. Cached for the build process so List runs
     * once and is shared by the generator and the agent-kit reference (DL#40).
     */
    listForms(): Promise<ListedFormView[]>;
    /**
     * Load one form's fields by id (runtime slow phase), with the fields this version cannot
     * render (DL #51). Throws only when the form has neither.
     */
    getFormFields(formId: string): Promise<ProjectedForm<FormFieldView>>;
    /**
     * The unprojected Get Form schema (DL #51 §3). Throws 'Form ID is not a valid Wix form id.'
     * for a non-GUID id and 'Form schema missing from Wix response' when Wix returns no form;
     * never throws for "no fields".
     */
    getRawForm(formId: string): Promise<RawForm>;
    /** @deprecated Since DL #51: the Summary API has no `required`. Use `getRawForm`. */
    getFormSummaryFields(formId?: string): Promise<ProjectedForm<FormFieldSummaryView>>;
    /**
     * Whether the public `submitForm` action accepts this canonical form id (DL #50): the
     * configured `formIds`, else the namespace's enabled forms. Rejects when the list cannot load.
     */
    isSubmittableForm(formId: string): Promise<boolean>;
    /**
     * Posts a submission. `authorization` (DL#43): the caller's access token
     * (`RequestIdentity.authorization`); omitted, it posts as the site.
     */
    createSubmission(
        formId: string,
        values: Record<string, FieldValue>,
        authorization?: string,
    ): Promise<void>;
}

export const WIX_FORMS_SERVICE = createJayService<WixFormsService>('WixFormsService');
