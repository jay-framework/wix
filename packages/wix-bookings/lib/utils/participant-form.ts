/**
 * The participant form as bookings reads it (DL #51 §3): Get Form, classified fail-closed by
 * wix-forms' table, bookings column. A field bookings cannot show is listed, never dropped.
 */

import {
    classifyFormField,
    fieldErrorsOf,
    ignoreReasonOf,
    isBlankAddress,
    projectAddressField,
    readAddressValue,
    toWixAddress,
    type ProjectionOptions,
    inLayoutOrder,
    readFieldKey,
    readFieldView,
    unsupportedFieldOf,
    type FieldKey,
    type FormFieldView,
    type ProjectedForm,
    type RawForm,
    validateFormField,
} from '@jay-framework/wix-forms';
import type { BookingFormFieldView, ParticipantFormValue } from '../types.js';

type BookingFieldType = BookingFormFieldView['type'];
type FormFieldInputType = FormFieldView['inputType'];

/** Bookings renders every field through one `<input>` ref: text-like kinds and a single checkbox. */
const BOOKING_TYPE_BY_INPUT_TYPE: Partial<Record<FormFieldInputType, BookingFieldType>> = {
    text: 'STRING',
    textarea: 'STRING',
    email: 'EMAIL',
    url: 'URL',
    tel: 'PHONE',
    checkbox: 'BOOLEAN',
    address: 'ADDRESS',
};

/** Rows 4-14, bookings column; undefined = unsupported. */
export function toBookingFieldType(key: FieldKey): BookingFieldType | undefined {
    // Row 10: per-form pages show a date picker as text; bookings has no date control yet.
    if (key.componentType === 'DATE_PICKER') return undefined;
    const inputType = classifyFormField(key);
    return inputType ? BOOKING_TYPE_BY_INPUT_TYPE[inputType] : undefined;
}

/** The `FormFieldView` that wix-forms' `validateFormField` checks a participant value against. */
export function toFormFieldView(view: BookingFormFieldView): FormFieldView {
    const { type, longText, ...field } = view;
    return { ...field, inputType: inputTypeOf(type, longText) };
}

function inputTypeOf(type: BookingFieldType, longText: boolean): FormFieldInputType {
    switch (type) {
        case 'STRING':
            return longText ? 'textarea' : 'text';
        case 'EMAIL':
            return 'email';
        case 'PHONE':
            return 'tel';
        case 'URL':
            return 'url';
        case 'BOOLEAN':
            return 'checkbox';
        case 'ADDRESS':
            return 'address';
    }
}

/**
 * Projects a participant form in layout order. Hidden and untargeted fields are skipped with
 * a server warning: bookings has no `control` channel to fill them. An address needs
 * `options.addressTemplates` (DL #52); a second address is unsupported (one `address` tag).
 */
export function projectParticipantForm(
    rawForm: RawForm,
    formId: string,
    warn: (message: string) => void,
    options: ProjectionOptions = {},
): ProjectedForm<BookingFormFieldView> {
    const projected: ProjectedForm<BookingFormFieldView> = { fields: [], unsupportedFields: [] };
    for (const raw of inLayoutOrder(rawForm)) {
        const key = readFieldKey(raw);
        const ignored = ignoreReasonOf(key);
        if (ignored === 'display') continue;
        if (ignored === 'no-target') {
            warn(
                `[wix-bookings] Form ${formId}: field "${key.label}" has no target in Wix and is ignored.`,
            );
            continue;
        }
        if (key.hidden) {
            const kind = key.required ? 'required hidden field' : 'hidden field';
            warn(
                `[wix-bookings] Form ${formId}: ${kind} "${key.label}" is ignored; bookings cannot fill hidden fields.`,
            );
            continue;
        }
        const type = toBookingFieldType(key);
        if (!type) {
            projected.unsupportedFields.push(unsupportedFieldOf(key));
            continue;
        }
        if (type === 'ADDRESS') {
            const address = addressFieldOf(key, projected, { warn, ...options });
            if (address) projected.fields.push(address);
            else projected.unsupportedFields.push(unsupportedFieldOf(key));
            continue;
        }
        projected.fields.push({
            target: key.target!,
            label: key.label,
            type,
            required: key.required,
            longText: classifyFormField(key) === 'textarea',
            ...readFieldView(raw, key),
        });
    }
    return projected;
}

function addressFieldOf(
    key: FieldKey,
    projected: ProjectedForm<BookingFormFieldView>,
    options: ProjectionOptions,
): BookingFormFieldView | undefined {
    if (projected.fields.some((field) => field.type === 'ADDRESS')) return undefined;
    const view = projectAddressField(key, options);
    if (!view?.address) return undefined;
    return {
        target: view.target,
        label: view.label,
        type: 'ADDRESS',
        required: view.required,
        longText: false,
        placeholder: '',
        options: [],
        address: view.address,
    };
}

/** The labels of the required fields bookings cannot show: any one disables booking. */
export function blockingFieldLabels(projected: ProjectedForm<BookingFormFieldView>): string[] {
    return projected.unsupportedFields
        .filter((field) => field.required === true)
        .map((field) => field.label);
}

/** `validateFormField` per field, in field order; a field with no value counts as empty. */
export function participantFieldErrors(
    fields: BookingFormFieldView[],
    values: Record<string, ParticipantFormValue>,
): Record<string, string> {
    const fieldErrors: Record<string, string> = {};
    for (const field of fields) {
        const formField = toFormFieldView(field);
        if (field.type === 'ADDRESS') {
            Object.assign(
                fieldErrors,
                fieldErrorsOf(formField, readAddressValue(values[field.target])),
            );
            continue;
        }
        const empty = formField.inputType === 'checkbox' ? false : '';
        const message = validateFormField(formField, values[field.target] ?? empty);
        if (message) fieldErrors[field.target] = message;
    }
    return fieldErrors;
}

/**
 * Only the values of rendered fields: unsupported fields and unknown keys never reach Wix. An
 * address is normalised (only its layout's parts) and an optional blank one is left out.
 */
export function supportedParticipantValues(
    fields: BookingFormFieldView[],
    values: Record<string, ParticipantFormValue>,
): Record<string, ParticipantFormValue> {
    const kept: Record<string, ParticipantFormValue> = {};
    for (const field of fields) {
        if (!Object.hasOwn(values, field.target)) continue;
        const value = values[field.target];
        if (field.type !== 'ADDRESS') {
            kept[field.target] = value;
            continue;
        }
        const address = normalisedAddress(field, value);
        if (address) kept[field.target] = address;
    }
    return kept;
}

/** The address as Wix takes it; undefined for an optional blank one (left out, DL #52 §1). */
export function normalisedAddress(
    field: BookingFormFieldView,
    value: ParticipantFormValue | undefined,
): ParticipantFormValue | undefined {
    const address = readAddressValue(value);
    if (!field.required && isBlankAddress(address)) return undefined;
    return toWixAddress(field.address!, address);
}
