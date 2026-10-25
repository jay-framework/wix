/**
 * Shared Wix Form component (DL#38, extended by DL#39).
 *
 * One schema-agnostic component serves every per-form contract. It reads the
 * form identity from `props.metadata.formId` (set by the generator), loads that
 * form's fields in the slow phase, and builds a view-state object KEYED BY FIELD
 * TARGET plus the reserved form-level tags.
 *
 * DL#39 turns this into general forms infrastructure. Everything rests on ONE
 * per-field value store (§0): a `Record<target, value>` signal that is the single
 * source of truth for each field's current value. Submission, prefill, live
 * validation, hidden/custom-UI values, and the confirmation echo are all thin
 * consumers of that store.
 */

import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type PageProps,
    type DynamicContractProps,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createEffect, createSignal, Props } from '@jay-framework/component';
import { useGlobalContext } from '@jay-framework/runtime';
import { WixApiError } from '@jay-framework/wix-server-client';
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client/client';
import { WIX_FORMS_SERVICE, type WixFormsService } from '../services/wix-forms-service-marker.js';
import type { FieldValue, FormFieldView } from '../types.js';
import type { MemberPrefillMap } from '../utils/member-prefill.js';
import { submitForm } from '../actions/forms-actions.js';
import { parseSubmissionFieldErrors, validateFormField } from '../utils/project-form-fields.js';
import {
    emptyStoreFor,
    emptyValueFor,
    projectSubmissionValues,
    seedControlValues,
    type ControlSeed,
} from './submission-values.js';
import { getMyMember } from '../wix-apis/get-my-member.js';
import { readMemberPrefillValues } from '../utils/member-prefill.js';
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
    memberPrefill: MemberPrefillMap;
    loadError?: string;
}

async function renderSlowlyChanging(props: WixFormProps, forms: WixFormsService) {
    const formId = props.metadata?.formId ?? '';
    const memberPrefill = forms.config.memberPrefill ?? {};
    try {
        const fields = await forms.getFormFields(formId);
        return phaseOutput<Record<string, unknown>, WixFormCarryForward>(
            buildFormViewState(fields, { isSubmitting: false, statusMessage: '', loadError: '' }),
            { formId, fields, memberPrefill },
            { ttl: SLOW_RENDER_TTL, grace: SLOW_RENDER_GRACE },
        );
    } catch (error) {
        const loadError = describeLoadError(error);
        console.error('[wix-form] getFormFields failed:', error);
        return phaseOutput<Record<string, unknown>, WixFormCarryForward>(
            buildFormViewState([], { isSubmitting: false, statusMessage: '', loadError }),
            { formId, fields: [], memberPrefill, loadError },
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
    const [invalidByTarget, setInvalidByTarget] = createSignal<Record<string, boolean>>({});
    const [isSubmitted, setIsSubmitted] = createSignal(false);
    // The per-field value store — the one source of truth for each field's value (§0).
    const [values, setValues] = createSignal<Record<string, FieldValue>>({});
    // Fields the user has edited; async member prefill never overwrites these (Q11).
    const dirtyTargets = new Set<string>();
    // Honeypot value is kept OUT of the store so it never reaches readFormValues (Q12).
    let honeypotValue = '';

    const wixClientContext = useGlobalContext(WIX_CLIENT_CONTEXT);

    function setFieldValue(target: string, value: FieldValue): void {
        setValues((current) => ({ ...current, [target]: value }));
    }

    /** Submission payload — a synchronous projection of the store, never the DOM (§0). */
    function readFormValues(): Record<string, FieldValue> {
        return projectSubmissionValues(carryForward.fields, values());
    }

    function validateField(field: FormFieldView): void {
        const message = validateFormField(field, values()[field.target] ?? emptyValueFor(field));
        setErrorByTarget((current) => ({ ...current, [field.target]: message }));
        setInvalidByTarget((current) => ({ ...current, [field.target]: Boolean(message) }));
    }

    function clearFieldError(field: FormFieldView): void {
        setErrorByTarget((current) => ({ ...current, [field.target]: '' }));
        setInvalidByTarget((current) => ({ ...current, [field.target]: false }));
    }

    /** Push a store value back into a native input for visual consistency (Q5, Q6). */
    function reflectToInput(field: FormFieldView, value: FieldValue): void {
        refs[contractTagName(field.target)]?.input?.exec$((element: HTMLElement) => {
            if (field.inputType === 'checkbox') {
                (element as HTMLInputElement).checked = value === true;
            } else if (field.inputType === 'multiselect') {
                const selected = Array.isArray(value) ? value : [];
                for (const option of Array.from((element as HTMLSelectElement).options)) {
                    option.selected = selected.includes(option.value);
                }
            } else {
                (element as HTMLInputElement).value = typeof value === 'string' ? value : '';
            }
        });
    }

    function handleNativeInput(field: FormFieldView, event: Event): void {
        dirtyTargets.add(field.target);
        setFieldValue(field.target, readNativeValue(field, event.target));
        clearFieldError(field);
    }

    function handleControl(field: FormFieldView, event: Event): void {
        dirtyTargets.add(field.target);
        const value = readControlValue(event.target);
        setFieldValue(field.target, value);
        reflectToInput(field, value);
        validateField(field);
    }

    wireFieldEvents(refs, carryForward.fields, {
        onNativeInput: handleNativeInput,
        onNativeBlur: validateField,
        onControl: handleControl,
    });
    wireHoneypot(refs, (value) => {
        honeypotValue = value;
    });

    // Element-bound work must wait for mount. `exec$` reads a ref's element, which is bound
    // only AFTER component construction; a construction-time `exec$` resolves to `undefined`.
    // So both the <form>-navigation guard and the page-provided control seeding run here, on
    // mount, where the elements exist. (Event registration above is safe at construction —
    // listeners are deferred and attached when the element binds.)
    createEffect(() => {
        preventNativeFormSubmit(refs);
        void seedControlsIntoStore(refs, carryForward.fields, dirtyTargets, setValues);
    });

    void seedFromMember();

    function resetForm(): void {
        setValues(emptyStoreFor(carryForward.fields));
        setErrorByTarget({});
        setInvalidByTarget({});
        setStatusMessage('');
        setIsSubmitted(false);
        dirtyTargets.clear();
        honeypotValue = '';
        clearNativeInputsAfterRemount();
    }

    /**
     * Clear the native inputs AFTER the form branch has re-mounted (browser-QA reset bug).
     *
     * `setIsSubmitted(false)` re-shows the `<form if="!...isSubmitted">` branch, but the
     * runtime applies that re-mount only when the current reactive batch flushes — which
     * happens synchronously at the END of this event handler, after `resetForm` returns
     * (handlers run inside `batchReactions`). Two runtime facts make a synchronous clear
     * here fail silently: the conditional REUSES the same cached <input> DOM nodes across
     * the toggle (they keep their old `.value`), and while the branch is unmounted its refs
     * are detached — so `reflectToInput`'s `exec$` resolves against an empty ref collection
     * and no-ops, leaving the re-shown inputs pre-filled. Deferring to a microtask runs the
     * clear after the flush has re-mounted the branch and re-bound the refs, so `exec$`
     * reaches the visible input nodes before the browser paints (no flash).
     */
    function clearNativeInputsAfterRemount(): void {
        queueMicrotask(() => {
            for (const field of carryForward.fields) {
                reflectToInput(field, emptyValueFor(field));
            }
        });
    }

    // A <button> inside a <form> defaults to type=submit, so a click triggers the browser's
    // native submission (a GET navigation that reloads the page before any async handler runs).
    // Cancel that default on every form button; the <form> guard in the mount effect is the
    // belt-and-suspenders for Enter-key / programmatic submits that bypass the button click.
    refs.resetButton?.onclick(({ event }: { event: Event }) => {
        event.preventDefault();
        resetForm();
    });

    refs.submitButton?.onclick(async ({ event }: { event: Event }) => {
        event.preventDefault();
        setStatusMessage('');
        setErrorByTarget({});

        // Honeypot trip: fake success (a bot must not tell), never call the API (Q12).
        if (honeypotValue.trim()) {
            setIsSubmitted(true);
            return;
        }

        const submissionValues = readFormValues();
        const clientErrors: Record<string, string> = {};
        const invalid: Record<string, boolean> = {};
        for (const field of carryForward.fields) {
            const errorMessage = validateFormField(
                field,
                submissionValues[field.target] ?? emptyValueFor(field),
            );
            if (errorMessage) {
                clientErrors[field.target] = errorMessage;
                invalid[field.target] = true;
            }
        }
        if (Object.keys(clientErrors).length) {
            setErrorByTarget(clientErrors);
            setInvalidByTarget(invalid);
            return;
        }

        setIsSubmitting(true);
        try {
            await submitForm({ formId: carryForward.formId, values: submissionValues });
            setIsSubmitted(true);
            // The store is intentionally NOT cleared — the confirmation echoes it (Q2).
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

    async function seedFromMember(): Promise<void> {
        if (!Object.keys(carryForward.memberPrefill).length) {
            return;
        }
        const wixClient = wixClientContext?.client;
        if (!wixClient) {
            return;
        }
        const member = await getMyMember(wixClient);
        const prefill = readMemberPrefillValues(member, carryForward.memberPrefill);
        for (const [target, value] of Object.entries(prefill)) {
            if (dirtyTargets.has(target)) {
                continue; // the user already edited this field — never clobber it (Q11)
            }
            setFieldValue(target, value);
            const field = carryForward.fields.find((candidate) => candidate.target === target);
            if (field) {
                reflectToInput(field, value);
            }
        }
    }

    return {
        render: () =>
            buildFormViewState(carryForward.fields, {
                isSubmitting: isSubmitting(),
                statusMessage: statusMessage(),
                loadError: carryForward.loadError ?? '',
                errorByTarget: errorByTarget(),
                invalidByTarget: invalidByTarget(),
                valueByTarget: values(),
                isSubmitted: isSubmitted(),
            }),
    };
}

interface FieldEventHandlers {
    onNativeInput(field: FormFieldView, event: Event): void;
    onNativeBlur(field: FormFieldView): void;
    onControl(field: FormFieldView, event: Event): void;
}

/** Wire the native `input` (store + live validation) and the `control` channel per field. */
function wireFieldEvents(
    refs: any,
    fields: FormFieldView[],
    handlers: FieldEventHandlers,
): void {
    for (const field of fields) {
        const fieldRef = refs[contractTagName(field.target)];
        if (!fieldRef) continue;
        fieldRef.input?.oninput(({ event }: { event: Event }) => handlers.onNativeInput(field, event));
        fieldRef.input?.onblur(() => handlers.onNativeBlur(field));
        fieldRef.control?.onclick(({ event }: { event: Event }) => handlers.onControl(field, event));
        fieldRef.control?.oninput(({ event }: { event: Event }) => handlers.onControl(field, event));
    }
}

/**
 * Prevent a native <form> submission from navigating (Bug 1). A `<button>` inside a form
 * defaults to type=submit, so a click — or an Enter keypress, or a programmatic submit —
 * triggers the browser's own GET submission and reloads the page before the async submit
 * handler runs. Guard the owning <form> directly so no submission path can navigate,
 * regardless of button type. Must run on mount (`exec$` needs the bound element).
 */
function preventNativeFormSubmit(refs: any): void {
    void refs.submitButton?.exec$((button: HTMLButtonElement) => {
        button.form?.addEventListener('submit', (nativeEvent: Event) => nativeEvent.preventDefault());
    });
}

/**
 * Seed the store from each `control` element's `data-value` — page-provided defaults and
 * hidden fields (Cap 4a, Bug 2). Reads the DOM on mount (a construction-time `exec$` sees
 * no bound element and silently resolves to `undefined`), then applies the pure
 * `seedControlValues` so untouched, non-empty control values reach the submission store
 * before client validation runs. Returns the read/seed promise so callers can await it.
 */
function seedControlsIntoStore(
    refs: any,
    fields: FormFieldView[],
    dirtyTargets: Set<string>,
    setValues: (updater: (current: Record<string, FieldValue>) => Record<string, FieldValue>) => void,
): Promise<void> {
    const seeds: ControlSeed[] = [];
    const reads = fields.map((field) => {
        const control = refs[contractTagName(field.target)]?.control;
        if (!control?.exec$) return Promise.resolve();
        return control
            .exec$((element: HTMLElement) => readControlValue(element))
            .then((value: string | undefined) => {
                seeds.push({
                    target: field.target,
                    value: value ?? '',
                    dirty: dirtyTargets.has(field.target),
                });
            });
    });
    return Promise.all(reads).then(() => {
        setValues((current) => seedControlValues(current, seeds));
    });
}

/** Record the honeypot value (Q12) — a dedicated channel that never reaches the store. */
function wireHoneypot(refs: any, record: (value: string) => void): void {
    refs.honeypot?.oninput(({ event }: { event: Event }) => {
        record((event.target as HTMLInputElement).value ?? '');
    });
}

/**
 * Read a native input's value by field kind (DL#39 4c): a checkbox reads `.checked`
 * (boolean), a multiselect reads `.selectedOptions` (string[]), everything else `.value`.
 */
function readNativeValue(field: FormFieldView, target: EventTarget | null): FieldValue {
    if (field.inputType === 'checkbox') {
        return (target as HTMLInputElement | null)?.checked ?? false;
    }
    if (field.inputType === 'multiselect') {
        const select = target as HTMLSelectElement | null;
        return select ? Array.from(select.selectedOptions).map((option) => option.value) : [];
    }
    const element = target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    return element?.value ?? '';
}

/** Read a custom-UI element's chosen value from `data-value`, falling back to `.value`. */
function readControlValue(target: EventTarget | null): string {
    const element = target as HTMLElement | null;
    if (!element) return '';
    const dataValue = element.getAttribute?.('data-value');
    if (dataValue !== null && dataValue !== undefined) {
        return dataValue;
    }
    return (element as HTMLInputElement).value ?? '';
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
