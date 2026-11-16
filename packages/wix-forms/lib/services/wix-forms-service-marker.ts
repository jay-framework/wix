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
import type { AddressTemplates } from '../address/address-templates.js';
import type { LearnedAddressFacts } from '../address/learned-address-facts.js';
import type { LearnedFactsSnapshot } from '../address/address-types.js';

/** Per-call projection options of `getFormFields` (DL #52 §5). */
export interface FormFieldsOptions {
    /** Merged into each address spec; omitted = the base spec (the slow-render cache holds only that). */
    learnedFacts?: LearnedFactsSnapshot;
}

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
    getFormFields(
        formId: string,
        options?: FormFieldsOptions,
    ): Promise<ProjectedForm<FormFieldView>>;
    /**
     * The 12 address layouts (DL #52 Q3): cached 1 h per process; rejects with
     * `AddressLayoutsUnavailableError` (transient: the form is unavailable).
     */
    addressTemplates(): Promise<AddressTemplates>;
    /** The process-wide store of what Wix's 400s taught (DL #52 Q6, Q17), shared with bookings. */
    learnedAddressFacts(): LearnedAddressFacts;
    /**
     * A form's address fields, projected per call with the current learned facts (DL #52 §5).
     * `[]` without a Get Form call only when the listed form has no address; a form that is not
     * listed (submittable but outside `formIds` / `include`) is projected like any other.
     */
    addressFieldsOf(formId: string): Promise<FormFieldView[]>;
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
