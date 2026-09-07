import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, Props } from '@jay-framework/component';
import { WixApiError } from '@jay-framework/wix-server-client';
import type {
    FieldCatalogOfWixFormBaseViewState,
    FieldOfWixFormBaseViewState,
    OptionOfWixFormBaseViewState,
    WixFormBaseContract,
    WixFormBaseFastViewState,
    WixFormBaseRefs,
    WixFormBaseSlowViewState,
} from '../contracts/wix-form-base.jay-contract.js';
import { WIX_FORMS_SERVICE, type WixFormsService } from '../services/wix-forms-service-marker.js';
import type { FormFieldErrorView, FormFieldView } from '../types.js';
import { submitForm } from '../actions/forms-actions.js';
import { parseSubmissionFieldErrors, validateFormField } from '../utils/project-form-fields.js';
import { toFieldCatalogRows } from '../utils/field-catalog.js';
import { isFormOnSite, resolveFormId } from '../utils/resolve-form-id.js';

export interface WixFormProps {
    formId?: string;
    contractName?: string;
}

interface WixFormCarryForward {
    formId: string;
    fields: FormFieldView[];
    options: OptionOfWixFormBaseViewState[];
    fieldCatalog: FieldCatalogOfWixFormBaseViewState[];
    loadError?: string;
}

function flattenOptions(fields: FormFieldView[]): OptionOfWixFormBaseViewState[] {
    const options: OptionOfWixFormBaseViewState[] = [];
    for (const field of fields) {
        for (const option of field.options) {
            options.push({
                id: `${field.target}:${option.value}`,
                fieldTarget: field.target,
                value: option.value,
                label: option.label,
            });
        }
    }
    return options;
}

function toContractFields(fields: FormFieldView[]): FieldOfWixFormBaseViewState[] {
    return fields.map((field) => ({
        target: field.target,
        label: field.label,
        inputType: field.inputType,
        isTextarea: field.inputType === 'textarea',
        required: field.required,
        placeholder: field.placeholder,
        hasOptions: field.options.length > 0,
    }));
}

function warnIfFormNotOnSite(forms: WixFormsService, formId: string): void {
    if (!formId) {
        return;
    }
    if (!isFormOnSite(forms, formId)) {
        console.warn(
            `[wix-form] formId "${formId}" is not in the site forms catalog. Re-run jay-stack agent-kit.`,
        );
    }
}

async function renderSlowlyChanging(props: WixFormProps, forms: WixFormsService) {
    let formId: string;
    try {
        formId = await resolveFormId(forms, {
            formIdProp: props.formId,
            contractName: props.contractName,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not resolve form.';
        return phaseOutput<WixFormBaseSlowViewState, WixFormCarryForward>(
            { fieldCatalog: [] },
            { formId: '', fields: [], options: [], fieldCatalog: [], loadError: message },
        );
    }
    warnIfFormNotOnSite(forms, formId);

    try {
        const fields = await forms.getFormFields(formId);
        const fieldCatalog = toFieldCatalogRows(fields);
        return phaseOutput<WixFormBaseSlowViewState, WixFormCarryForward>(
            { fieldCatalog },
            { formId, fields, options: flattenOptions(fields), fieldCatalog },
        );
    } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Could not load the form.';
        const message = rawMessage.includes('403')
            ? 'Forms API access denied. Add Wix Forms permission to your API key in the Wix dashboard.'
            : rawMessage || 'Could not load the form. Please try again later.';
        console.error('[wix-form] getFormFields failed:', error);
        return phaseOutput<WixFormBaseSlowViewState, WixFormCarryForward>(
            { fieldCatalog: [] },
            { formId, fields: [], options: [], fieldCatalog: [], loadError: message },
        );
    }
}

async function renderFastChanging(props: WixFormProps, carryForward: WixFormCarryForward) {
    const Pipeline = RenderPipeline.for<WixFormBaseFastViewState, WixFormCarryForward>();
    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            fields: toContractFields(carryForward.fields),
            options: carryForward.options,
            isLoading: carryForward.fields.length === 0 && !carryForward.loadError,
            loadError:
                carryForward.loadError ??
                (carryForward.fields.length
                    ? ''
                    : 'Could not load the form. Please try again later.'),
            isSubmitting: false,
            statusMessage: '',
            fieldErrors: [],
        },
        carryForward: {
            formId: carryForward.formId || props.formId || '',
            fields: carryForward.fields,
            options: carryForward.options,
            fieldCatalog: carryForward.fieldCatalog,
        },
    }));
}

function WixFormInteractive(
    props: Props<WixFormProps>,
    refs: WixFormBaseRefs,
    viewStateSignals: Signals<WixFormBaseFastViewState>,
    carryForward: WixFormCarryForward,
) {
    const [isSubmitting, setIsSubmitting] = createSignal(false);
    const [statusMessage, setStatusMessage] = createSignal('');
    const [fieldErrors, setFieldErrors] = createSignal<FormFieldErrorView[]>([]);

    async function readFormValues(): Promise<Record<string, string>> {
        const values: Record<string, string> = {};
        const inputReads =
            refs.fields?.formInputs?.map((input, field) =>
                input.exec$((element) => ({
                    target: field.target,
                    value: element.value,
                })),
            ) ?? [];
        const textareaReads =
            refs.fields?.formTextareas?.map((textarea, field) =>
                textarea.exec$((element) => ({
                    target: field.target,
                    value: element.value,
                })),
            ) ?? [];
        const selectReads =
            refs.fields?.formSelects?.map((select, field) =>
                select.exec$((element) => ({
                    target: field.target,
                    value: element.value,
                })),
            ) ?? [];
        const resolved = await Promise.all([...inputReads, ...textareaReads, ...selectReads]);
        for (const entry of resolved) {
            values[entry.target] = entry.value;
        }
        return values;
    }

    async function clearFormValues(): Promise<void> {
        const clears = [
            ...(refs.fields?.formInputs?.map((input) =>
                input.exec$((element) => {
                    element.value = '';
                }),
            ) ?? []),
            ...(refs.fields?.formTextareas?.map((textarea) =>
                textarea.exec$((element) => {
                    element.value = '';
                }),
            ) ?? []),
            ...(refs.fields?.formSelects?.map((select) =>
                select.exec$((element) => {
                    element.value = '';
                }),
            ) ?? []),
        ];
        await Promise.all(clears);
    }

    refs.submitButton?.onclick(async () => {
        setStatusMessage('');
        setFieldErrors([]);

        const values = await readFormValues();
        const clientErrors: FormFieldErrorView[] = [];
        for (const field of carryForward.fields) {
            const errorMessage = validateFormField(field, values[field.target] ?? '');
            if (errorMessage) {
                clientErrors.push({ target: field.target, errorMessage });
            }
        }
        if (clientErrors.length) {
            setFieldErrors(clientErrors);
            return;
        }

        setIsSubmitting(true);
        try {
            await submitForm({
                formId:
                    carryForward.formId || (typeof props.formId === 'string' ? props.formId : ''),
                values,
            });
            setStatusMessage('Form submitted successfully.');
            await clearFormValues();
        } catch (error) {
            if (error instanceof WixApiError) {
                const mapped = parseSubmissionFieldErrors(error.responseBody);
                const mappedErrors = Object.entries(mapped).map(([target, errorMessage]) => ({
                    target,
                    errorMessage,
                }));
                if (mappedErrors.length) {
                    setFieldErrors(mappedErrors);
                    return;
                }
            }
            const rawMessage =
                error instanceof Error ? error.message : 'Something went wrong. Please try again.';
            const message = rawMessage.includes('403')
                ? 'Form submission denied. Add Wix Forms permission to your API key in the Wix dashboard.'
                : rawMessage;
            setStatusMessage(message);
        } finally {
            setIsSubmitting(false);
        }
    });

    return {
        render: () => ({
            fields: toContractFields(carryForward.fields),
            options: carryForward.options,
            isLoading: carryForward.fields.length === 0 && !carryForward.loadError,
            loadError:
                carryForward.loadError ??
                (carryForward.fields.length
                    ? ''
                    : 'Could not load the form. Please try again later.'),
            isSubmitting: isSubmitting(),
            statusMessage: statusMessage(),
            fieldErrors: fieldErrors(),
        }),
    };
}

export const wixForm = makeJayStackComponent<WixFormBaseContract>()
    .withProps<WixFormProps>()
    .withServices(WIX_FORMS_SERVICE)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(WixFormInteractive);
