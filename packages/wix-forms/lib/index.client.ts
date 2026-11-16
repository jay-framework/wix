/**
 * Client-safe entry point for @jay-framework/wix-forms.
 */
export { init } from './init.js';
export { wixForm } from './components/wix-form.js';
export { getFormSummary, submitForm } from './actions/forms-actions.js';
export {
    checkFormField,
    projectFormFields,
    unsupportedFieldOf,
    inLayoutOrder,
    validateFormField,
    validateFormSummaryField,
} from './utils/project-form-fields.js';
export { toPostedSummaryValues } from './components/submission-values.js';
export { FieldRule, type FieldCheckResult } from './components/field-rule.js';
export {
    WIX_FORMS_CONTEXT,
    provideWixFormsContext,
    type FieldCheck,
    type FieldChecks,
    type SubmitOutcomeEvent,
    type SubmitOutcomeHandler,
    type SubmitStartEvent,
    type SubmitStartHandler,
    type WixFormsContext,
} from './contexts/wix-forms-context.js';
// Pure classification (DL #51), shared with wix-bookings' client code.
export {
    readFieldKey,
    classifyFormField,
    ignoreReasonOf,
    wixKindOf,
    type FieldKey,
    type FieldIgnoreReason,
} from './utils/classify-form-field.js';
export { readFieldView, type FieldViewData } from './utils/read-field-view.js';
export { canonicalFormId } from './utils/form-id.js';
// Address fields (DL #52): the value, the spec and the located errors.
export {
    addressErrorKey,
    initialAddressValue,
    isAddressValue,
    isBlankAddress,
    layoutOf,
    nextAddressValue,
    readAddressValue,
    splitErrorKey,
    toWixAddress,
    validateAddressValue,
    withLearnedFacts,
} from './address/address-value.js';
export {
    ADDRESS_PARTS,
    LAYOUT_PARTS,
    type AddressFieldSpec,
    type AddressLayout,
    type AddressPart,
    type AddressPartSpec,
    type AddressSchemaFacts,
    type AddressValue,
    type CountryCode,
    type LayoutPart,
    type LearnedFactsSnapshot,
} from './address/address-types.js';
export { addressMessageFor, type LocatedViolation } from './utils/located-violations.js';
export { fieldErrorsOf } from './utils/project-form-fields.js';
export {
    addressViewState,
    type AddressPartViewState,
    type AddressViewState,
} from './components/form-view-state.js';
export { addressFieldTag } from './generators/contract-utils.js';

export type { RawForm, RawFormField } from './wix-apis/get-form.js';
export type {
    FieldValue,
    FormFieldView,
    FormFieldSummaryView,
    PhoneRules,
    FormFieldErrorView,
    FormFieldOptionView,
    ProjectedForm,
    UnsupportedFieldView,
} from './types.js';
