/**
 * Shared Wix Form component (DL#36).
 *
 * One schema-agnostic component serves every per-form contract. It reads the
 * form identity from `props.metadata.formId` (set by the generator), loads that
 * form's fields in the slow phase, and builds a view-state object KEYED BY FIELD
 * TARGET (`{ email: { label, placeholder, required, error }, country: { …, options } }`)
 * plus the reserved form-level tags — mirroring wix-data's `collectionItem`.
 */

import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type PageProps,
    type DynamicContractProps,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, Props } from '@jay-framework/component';
import { WixApiError } from '@jay-framework/wix-server-client';
import { WIX_FORMS_SERVICE, type WixFormsService } from '../services/wix-forms-service-marker.js';
import type { FormFieldView } from '../types.js';
import { submitForm } from '../actions/forms-actions.js';
import { parseSubmissionFieldErrors, validateFormField } from '../utils/project-form-fields.js';
import {
    SLOW_RENDER_TTL,
    SLOW_RENDER_GRACE,
    SLOW_RENDER_ERROR_TTL,
} from '../slow-render-defaults.js';
import { contractTagName } from '../generators/contract-utils.js';
import { buildFormViewState } from './form-view-state.js';

interface WixFormMetadata {
    formId: string;
}

type WixFormProps = PageProps & DynamicContractProps<WixFormMetadata>;

interface WixFormCarryForward {
    formId: string;
    fields: FormFieldView[];
    loadError?: string;
}

async function renderSlowlyChanging(props: WixFormProps, forms: WixFormsService) {
    const formId = props.metadata?.formId ?? '';
    try {
        const fields = await forms.getFormFields(formId);
        return phaseOutput<Record<string, unknown>, WixFormCarryForward>(
            buildFormViewState(fields, { isSubmitting: false, statusMessage: '', loadError: '' }),
            { formId, fields },
            { ttl: SLOW_RENDER_TTL, grace: SLOW_RENDER_GRACE },
        );
    } catch (error) {
        const loadError = describeLoadError(error);
        console.error('[wix-form] getFormFields failed:', error);
        return phaseOutput<Record<string, unknown>, WixFormCarryForward>(
            buildFormViewState([], { isSubmitting: false, statusMessage: '', loadError }),
            { formId, fields: [], loadError },
            { ttl: SLOW_RENDER_ERROR_TTL },
        );
    }
}

async function renderFastChanging(props: WixFormProps, carryForward: WixFormCarryForward) {
    const Pipeline = RenderPipeline.for<Record<string, unknown>, WixFormCarryForward>();
    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: buildFormViewState(carryForward.fields, {
            isSubmitting: false,
            statusMessage: '',
            loadError: carryForward.loadError ?? '',
        }),
        carryForward,
    }));
}

function WixFormInteractive(
    _props: Props<WixFormProps>,
    refs: any,
    _viewStateSignals: Signals<Record<string, unknown>>,
    carryForward: WixFormCarryForward,
) {
    const [isSubmitting, setIsSubmitting] = createSignal(false);
    const [statusMessage, setStatusMessage] = createSignal('');
    const [errorByTarget, setErrorByTarget] = createSignal<Record<string, string>>({});

    async function readFormValues(): Promise<Record<string, string>> {
        const reads = carryForward.fields.map((field) =>
            refs[contractTagName(field.target)]?.input?.exec$((element: HTMLInputElement) => ({
                target: field.target,
                value: element.value,
            })),
        );
        const resolved = await Promise.all(reads.filter(Boolean));
        const values: Record<string, string> = {};
        for (const entry of resolved) {
            if (entry) values[entry.target] = entry.value;
        }
        return values;
    }

    async function clearFormValues(): Promise<void> {
        const clears = carryForward.fields.map((field) =>
            refs[contractTagName(field.target)]?.input?.exec$((element: HTMLInputElement) => {
                element.value = '';
            }),
        );
        await Promise.all(clears.filter(Boolean));
    }

    refs.submitButton?.onclick(async () => {
        setStatusMessage('');
        setErrorByTarget({});

        const values = await readFormValues();
        const clientErrors: Record<string, string> = {};
        for (const field of carryForward.fields) {
            const errorMessage = validateFormField(field, values[field.target] ?? '');
            if (errorMessage) {
                clientErrors[field.target] = errorMessage;
            }
        }
        if (Object.keys(clientErrors).length) {
            setErrorByTarget(clientErrors);
            return;
        }

        setIsSubmitting(true);
        try {
            await submitForm({ formId: carryForward.formId, values });
            setStatusMessage('Form submitted successfully.');
            await clearFormValues();
        } catch (error) {
            if (error instanceof WixApiError) {
                const mapped = parseSubmissionFieldErrors(error.responseBody);
                if (Object.keys(mapped).length) {
                    setErrorByTarget(mapped);
                    return;
                }
            }
            setStatusMessage(describeSubmitError(error));
        } finally {
            setIsSubmitting(false);
        }
    });

    return {
        render: () =>
            buildFormViewState(carryForward.fields, {
                isSubmitting: isSubmitting(),
                statusMessage: statusMessage(),
                loadError: carryForward.loadError ?? '',
                errorByTarget: errorByTarget(),
            }),
    };
}

function describeLoadError(error: unknown): string {
    const rawMessage = error instanceof Error ? error.message : 'Could not load the form.';
    return rawMessage.includes('403')
        ? 'Forms API access denied. Add Wix Forms permission to your API key in the Wix dashboard.'
        : rawMessage || 'Could not load the form. Please try again later.';
}

function describeSubmitError(error: unknown): string {
    const rawMessage =
        error instanceof Error ? error.message : 'Something went wrong. Please try again.';
    return rawMessage.includes('403')
        ? 'Form submission denied. Add Wix Forms permission to your API key in the Wix dashboard.'
        : rawMessage;
}

export const wixForm = makeJayStackComponent<any>()
    .withProps<WixFormProps>()
    .withServices(WIX_FORMS_SERVICE)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(WixFormInteractive);
