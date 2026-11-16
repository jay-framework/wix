/**
 * The participant form as bookings reads it (DL #51 §3): Get Form, classified fail-closed by
 * wix-forms' table, bookings column. A field bookings cannot show is listed, never dropped.
 */

import {
    classifyFormField,
    ignoreReasonOf,
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
    }
}

/**
 * Projects a participant form in layout order. Hidden and untargeted fields are skipped with
 * a server warning: bookings has no `control` channel to fill them.
 */
export function projectParticipantForm(
    rawForm: RawForm,
    formId: string,
    warn: (message: string) => void,
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
        const empty = formField.inputType === 'checkbox' ? false : '';
        const message = validateFormField(formField, values[field.target] ?? empty);
        if (message) fieldErrors[field.target] = message;
    }
    return fieldErrors;
}

/** Only the values of rendered fields: unsupported fields and unknown keys never reach Wix. */
export function supportedParticipantValues(
    fields: BookingFormFieldView[],
    values: Record<string, ParticipantFormValue>,
): Record<string, ParticipantFormValue> {
    const targets = new Set(fields.map((field) => field.target));
    return Object.fromEntries(Object.entries(values).filter(([target]) => targets.has(target)));
}
